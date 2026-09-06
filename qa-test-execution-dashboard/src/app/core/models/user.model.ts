export interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
}

export interface PlatformUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  status: string;
  isEmailVerified: boolean;
  organization: OrganizationInfo;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: PlatformUser;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}
