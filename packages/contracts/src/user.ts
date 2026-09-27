export interface UserProfile {
  id: string
  nickname: string | null
  avatarFileId: string | null
  avatarUrl: string | null
  phoneBound: boolean
  maskedPhone: string | null
}
