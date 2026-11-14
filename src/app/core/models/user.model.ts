export interface User {
  id: string;
  username: string;
  email: string;
  bio?: string;
  avatarUrl?: string;
  /** JWT issued on login/register; sent as Bearer on API calls. */
  token?: string;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  avatarUrl?: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}
