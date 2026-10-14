export interface AuthUser {
  id: string;
  display_name: string;
  avatar_url?: string;
  created_at: string;
}

export interface AuthLoginResponse { url: string; state: string; }

export interface LinkedAccount {
  id: number;
  account_id: string;
  verification_status: 'pending' | 'verified';
  verification_token?: string;
  verified_at: string | null;
  trainer_name?: string;
  representative_uma_id?: number;
}

export type VerifyAccountResponse = LinkedAccount | {
  status: 'verified' | 'timeout' | 'not_verified' | string;
  message?: string;
};

export interface AuthIdentity { provider: string; provider_id: string; display_name?: string; }

export interface ApiKey {
  id: string;
  name: string;
  key?: string;
  key_prefix: string;
  last_used?: string;
  total_requests: number;
  created_at: string;
  revoked: boolean;
}
