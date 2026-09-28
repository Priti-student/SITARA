import { api } from "./client";

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isVerified: boolean;
  status: string;
  roles: string[];
  designation?: string | null;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export function register(input: {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  role?: string;
}): Promise<AuthResult> {
  return api<AuthResult>("/auth/register", { method: "POST", body: input });
}

export function login(input: { email: string; password: string }): Promise<AuthResult> {
  return api<AuthResult>("/auth/login", { method: "POST", body: input });
}

export function fetchMe(): Promise<{ user: User }> {
  return api<{ user: User }>("/auth/me");
}