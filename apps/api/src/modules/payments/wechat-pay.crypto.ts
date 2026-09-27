import { createDecipheriv, randomBytes, sign, verify } from 'node:crypto'
import type { PaymentLaunchParams } from '@template/contracts'

export type EncryptedResource = {
  algorithm: string
  nonce: string
  associated_data?: string
  ciphertext: string
}

export function buildRequestMessage(method: string, pathAndQuery: string, timestamp: number, nonce: string, body: string): string {
  return `${method}\n${pathAndQuery}\n${timestamp}\n${nonce}\n${body}\n`
}

export function signMessage(privateKey: string, message: string): string {
  return sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64')
}

export function verifySignedMessage(publicKey: string, timestamp: string, nonce: string, rawBody: string, signature: string): boolean {
  if (!timestamp || !nonce || !signature) return false
  return verify('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${rawBody}\n`), publicKey, Buffer.from(signature, 'base64'))
}

export function createMiniappPayParams(appId: string, prepayId: string, privateKey: string, timestamp = Math.floor(Date.now() / 1000), nonce = randomBytes(16).toString('hex')): PaymentLaunchParams {
  const timeStamp = String(timestamp)
  const packageValue = `prepay_id=${prepayId}`
  return {
    timeStamp,
    nonceStr: nonce,
    package: packageValue,
    signType: 'RSA',
    paySign: signMessage(privateKey, `${appId}\n${timeStamp}\n${nonce}\n${packageValue}\n`)
  }
}

export function decryptResource(apiV3Key: string, resource: EncryptedResource): string {
  if (resource.algorithm !== 'AEAD_AES_256_GCM' || Buffer.byteLength(apiV3Key) !== 32) {
    throw new Error('Invalid WeChat Pay encrypted resource')
  }
  const bytes = Buffer.from(resource.ciphertext, 'base64')
  if (bytes.length < 17) throw new Error('Invalid WeChat Pay ciphertext')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(resource.nonce))
  decipher.setAAD(Buffer.from(resource.associated_data ?? ''))
  decipher.setAuthTag(bytes.subarray(-16))
  return Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString('utf8')
}
