import { Injectable } from '@nestjs/common'
import OSS from 'ali-oss'

export interface UploadPolicyInput {
  bucket: string
  credential: string
  date: string
  key: string
  contentType: string
  maxBytes: number
  expiresAt: Date
}

export function buildUploadPolicy(input: UploadPolicyInput) {
  return {
    expiration: input.expiresAt.toISOString(),
    conditions: [
      { bucket: input.bucket },
      { 'x-oss-signature-version': 'OSS4-HMAC-SHA256' },
      { 'x-oss-credential': input.credential },
      { 'x-oss-date': input.date },
      ['eq', '$key', input.key],
      ['eq', '$content-type', input.contentType],
      ['content-length-range', 1, input.maxBytes],
      ['eq', '$x-oss-forbid-overwrite', 'true'],
      ['eq', '$success_action_status', '200']
    ] as Array<Record<string, string> | [string, string | number, string | number]>
  }
}

export interface OssGateway {
  signUpload(input: { key: string; contentType: string; maxBytes: number; expiresAt: Date }): Promise<{ url: string; fields: Record<string, string> }>
  head(key: string): Promise<{ size: number; contentType: string } | null>
  readUrl(key: string, expiresSeconds: number): Promise<string>
}

@Injectable()
export class OssProvider implements OssGateway {
  private config() {
    const { OSS_REGION: region, OSS_BUCKET: bucket, OSS_ENDPOINT: endpoint,
      OSS_ACCESS_KEY_ID: accessKeyId, OSS_ACCESS_KEY_SECRET: accessKeySecret } = process.env
    if (!region || !bucket || !endpoint || !accessKeyId || !accessKeySecret) {
      throw new Error('OSS configuration is required')
    }
    const url = new URL(endpoint)
    if (url.protocol !== 'https:') throw new Error('OSS_ENDPOINT must use HTTPS')
    if (!url.hostname.startsWith(`${bucket}.`)) throw new Error('OSS_ENDPOINT must be the bucket host')
    const sdkEndpoint = new URL(url.origin)
    sdkEndpoint.hostname = url.hostname.slice(bucket.length + 1)
    return { region, bucket, endpoint: url.origin, sdkEndpoint: sdkEndpoint.origin, accessKeyId, accessKeySecret }
  }

  private client() {
    const config = this.config()
    return { config, client: new OSS({ region: config.region, bucket: config.bucket, endpoint: config.sdkEndpoint, accessKeyId: config.accessKeyId, accessKeySecret: config.accessKeySecret, secure: true, authorizationV4: true }) }
  }

  async signUpload(input: { key: string; contentType: string; maxBytes: number; expiresAt: Date }) {
    const { client, config } = this.client()
    const now = new Date()
    const date = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    const credential = `${config.accessKeyId}/${date.slice(0, 8)}/${config.region}/oss/aliyun_v4_request`
    const policy = buildUploadPolicy({ bucket: config.bucket, credential, date, ...input })
    const signer = client as OSS & { signPostObjectPolicyV4(policy: object, date: Date): string }
    const fields = {
      key: input.key,
      'content-type': input.contentType,
      'success_action_status': '200',
      'x-oss-forbid-overwrite': 'true',
      'x-oss-signature-version': 'OSS4-HMAC-SHA256',
      'x-oss-credential': credential,
      'x-oss-date': date,
      'x-oss-signature': signer.signPostObjectPolicyV4(policy, now),
      policy: Buffer.from(JSON.stringify(policy)).toString('base64')
    }
    return { url: config.endpoint, fields }
  }

  async head(key: string): Promise<{ size: number; contentType: string } | null> {
    try {
      const result = await this.client().client.head(key)
      const headers = result.res.headers as Record<string, string | number | undefined>
      return { size: Number(headers['content-length']), contentType: String(headers['content-type']) }
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) return null
      throw error
    }
  }

  async readUrl(key: string, expiresSeconds: number): Promise<string> {
    return this.client().client.signatureUrlV4('GET', expiresSeconds, {}, key)
  }
}
