export interface WebviewAppSummary {
  appId: string
  name: string
}

export interface WebviewTicketResult {
  entryUrl: string
  ticket: string
  expiresIn: number
}

export interface WebviewExchangeResult {
  accessToken: string
  expiresIn: number
}

export interface WebviewProfile {
  id: string
  nickname: string | null
  avatarUrl: string | null
  phoneBound: boolean
}
