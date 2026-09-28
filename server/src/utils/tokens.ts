import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AccessTokenPayload {
  sub: string; // user id
  roles: string[];
  email: string;
}

export interface RefreshTokenPayload {
  sub: string; // user id
  jti: string; // token id (unique per issuance)
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
  });
  return decoded as AccessTokenPayload;
}

export function issueRefreshToken(userId: string): {
  rawToken: string;
  tokenHash: string;
  jti: string;
  expiresAt: Date;
} {
  const jti = crypto.randomUUID();
  const expiresInSeconds =
    Number(env.REFRESH_TOKEN_TTL_DAYS) * 24 * 60 * 60;
  const rawToken = jwt.sign({ sub: userId, jti }, env.JWT_REFRESH_SECRET, {
    algorithm: "HS256",
    expiresIn: expiresInSeconds,
  });
  return {
    rawToken,
    tokenHash: sha256(rawToken),
    jti,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: ["HS256"],
  });
  return decoded as RefreshTokenPayload;
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function generateTokenHash(token: string): string {
  return sha256(token);
}