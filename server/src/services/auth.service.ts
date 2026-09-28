import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middleware/error.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import {
  generateTokenHash,
  issueRefreshToken,
  signAccessToken,
  verifyRefreshToken,
} from "../utils/tokens.js";
import { env } from "../config/env.js";

/** Roles a user may self-assign at registration (higher roles are granted by admins). */
const SELF_SERVICE_ROLES = ["APPLICANT", "UNIT_USER"] as const;

export const registerSchema = z.object({
  fullName: z.string().min(2, "Full name is required").max(120),
  email: z.string().email("A valid email is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
  phone: z
    .string()
    .regex(/^[0-9]{10}$/, "Phone must be a 10-digit number")
    .optional(),
  role: z.enum(SELF_SERVICE_ROLES).default("APPLICANT"),
});

export const loginSchema = z.object({
  email: z.string().email("A valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

type RegisterInput = z.infer<typeof registerSchema>;
type LoginInput = z.infer<typeof loginSchema>;

function publicUser(user: {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isVerified: boolean;
  status: string;
  roles?: { role: { name: string } }[];
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    isVerified: user.isVerified,
    status: user.status,
    roles: user.roles?.map((r) => r.role.name as string) ?? [],
  };
}

/** Registers a new user and returns token pair + user. */
export async function register(input: RegisterInput) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: input.email.toLowerCase() },
        ...(input.phone ? [{ phone: input.phone }] : []),
      ],
    },
  });
  if (existing) {
    throw new AppError({
      message: "An account with this email/phone already exists",
      status: 409,
      code: "ACCOUNT_EXISTS",
    });
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      fullName: input.fullName,
      email: input.email.toLowerCase(),
      phone: input.phone,
      passwordHash,
      isVerified: true,
      roles: {
        create: [{ role: { connect: { name: input.role } } }],
      },
    },
    include: { roles: { include: { role: true } } },
  });

  const tokens = await issueSession(user.id);
  return { user: publicUser(user), ...tokens };
}

/** Verifies credentials and issues a fresh token pair. */
export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    include: { roles: { include: { role: true } } },
  });
  if (!user) {
    throw new AppError({
      message: "Invalid email or password",
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
  }
  if (user.status === "SUSPENDED") {
    throw new AppError({
      message: "This account is suspended",
      status: 403,
      code: "ACCOUNT_SUSPENDED",
    });
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    throw new AppError({
      message: "Invalid email or password",
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
  }

  const tokens = await issueSession(user.id);
  return { user: publicUser(user), ...tokens };
}

/** Rotates a refresh token: revokes the presented one and issues a fresh pair. */
export async function refresh(refreshToken: string) {
  let payload: ReturnType<typeof verifyRefreshToken>;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError({
      message: "Invalid refresh token",
      status: 401,
      code: "INVALID_REFRESH_TOKEN",
    });
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: generateTokenHash(refreshToken) },
  });
  if (!stored || stored.revokedAt !== null || stored.expiresAt < new Date()) {
    throw new AppError({
      message: "Refresh token expired or revoked",
      status: 401,
      code: "INVALID_REFRESH_TOKEN",
    });
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status === "SUSPENDED") {
    throw new AppError({
      message: "Account unavailable",
      status: 403,
      code: "ACCOUNT_UNAVAILABLE",
    });
  }

  const tokens = await issueSession(user.id);
  return { user: publicUser(user), ...tokens };
}

/** Revokes the presented refresh token (logout). */
export async function logout(refreshToken: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: generateTokenHash(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return { success: true };
}

/** Returns a token pair + persists a (hashed) refresh token row. */
async function issueSession(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user) {
    throw new AppError({
      message: "User not found",
      status: 404,
      code: "NOT_FOUND",
    });
  }
  const roleNames = user.roles.map((ur) => ur.role.name as string);
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    roles: roleNames,
  });
  const refresh = issueRefreshToken(user.id);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
    },
  });
  return {
    accessToken,
    refreshToken: refresh.rawToken,
    tokenType: "Bearer",
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  };
}

/** Loads the current user's fresh profile (incl. roles) from the database. */
export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user) {
    throw new AppError({ message: "User not found", status: 404, code: "NOT_FOUND" });
  }
  return {
    user: {
      ...publicUser(user),
      designation: user.designation,
      roles: user.roles.map((ur) => ur.role.name as string),
    },
  };
}