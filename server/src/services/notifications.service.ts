// ───────────────────────────────────────────────────────────────
// Notifications service — in-app alerts (checklist ready, …).
// Email/SMS channels can be added later behind the same service.
// ───────────────────────────────────────────────────────────────
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middleware/error.js";

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: unknown;
}

export async function createNotification(input: NotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      data: input.data === undefined ? undefined : (input.data as object),
    },
  });
}

export async function listMine(userId: string) {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  return { items, unreadCount };
}

export async function markRead(userId: string, notificationId: string) {
  const updated = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
  if (updated.count === 0) {
    throw new AppError({ message: "Notification not found", status: 404, code: "NOT_FOUND" });
  }
  return { success: true };
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return { success: true };
}