import { createCipheriv, generateKeyPairSync, sign, verify } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { buildRequestMessage, createMiniappPayParams, decryptResource, verifySignedMessage } from './wechat-pay.crypto.js'

const merchant = generateKeyPairSync('rsa', { modulusLength: 2048 })
const wechat = generateKeyPairSync('rsa', { modulusLength: 2048 })
const merchantPrivateKey = merchant.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const wechatPublicKey = wechat.publicKey.export({ type: 'spki', format: 'pem' }).toString()

describe('WeChat Pay API v3 crypto', () => {
  test('builds the exact canonical request message', () => {
    expect(buildRequestMessage('POST', '/v3/pay/transactions/jsapi', 1700000000, 'abc', '{"a":1}'))
      .toBe('POST\n/v3/pay/transactions/jsapi\n1700000000\nabc\n{"a":1}\n')
  })

  test('signs miniapp payment parameters with the merchant private key', () => {
    const params = createMiniappPayParams('wx-app', 'prepay-123', merchantPrivateKey, 1700000000, 'nonce')
    expect(params).toMatchObject({ timeStamp: '1700000000', nonceStr: 'nonce', package: 'prepay_id=prepay-123', signType: 'RSA' })
    const message = 'wx-app\n1700000000\nnonce\nprepay_id=prepay-123\n'
    expect(verify('RSA-SHA256', Buffer.from(message), merchant.publicKey, Buffer.from(params.paySign, 'base64'))).toBe(true)
  })

  test('verifies the original response or notification body and rejects changed content', () => {
    const body = '{"transaction_id":"123"}'
    const message = `1700000000\nnonce\n${body}\n`
    const signature = sign('RSA-SHA256', Buffer.from(message), wechat.privateKey).toString('base64')
    expect(verifySignedMessage(wechatPublicKey, '1700000000', 'nonce', body, signature)).toBe(true)
    expect(verifySignedMessage(wechatPublicKey, '1700000000', 'nonce', `${body} `, signature)).toBe(false)
  })

  test('decrypts AES-256-GCM notification resources', () => {
    const key = '0123456789abcdef0123456789abcdef'
    const nonce = '0123456789ab'
    const plaintext = '{"out_trade_no":"test"}'
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(nonce))
    cipher.setAAD(Buffer.from('associated'))
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]).toString('base64')
    expect(decryptResource(key, { algorithm: 'AEAD_AES_256_GCM', nonce, associated_data: 'associated', ciphertext })).toBe(plaintext)
    expect(() => decryptResource(key, { algorithm: 'AEAD_AES_256_GCM', nonce, associated_data: 'changed', ciphertext })).toThrow()
  })
})
