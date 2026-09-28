import { api } from "./client";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: { checklistId?: string } | null;
}

export function listNotifications(): Promise<{ items: NotificationItem[]; unreadCount: number }> {
  return api("/notifications");
}

export function markRead(id: string): Promise<{ success: boolean }> {
  return api(`/notifications/${id}/read`, { method: "POST" });
}

export function markAllRead(): Promise<{ success: boolean }> {
  return api("/notifications/read-all", { method: "POST" });
}