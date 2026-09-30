import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listNotifications,
  markAllRead,
  markRead,
  type NotificationItem,
} from "../api/notifications";

export function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  function load() {
    listNotifications()
      .then((d) => {
        setItems(d.items);
        setUnread(d.unreadCount);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load notifications"));
  }

  useEffect(load, []);

  if (!user) return null;

  return (
    <div className="page">
        <section className="welcome">
          <div className="module-title-row">
            <h1>
              <span className="accent">Notifications</span>
            </h1>
            <span className="chip chip-accent">{unread} unread</span>
          </div>
          {unread > 0 ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => markAllRead().then(load).catch(() => {})}
            >
              Mark all read
            </button>
          ) : null}
        </section>

        {err ? <div className="alert alert-error">{err}</div> : null}

        <section className="rules-grid">
          {items.length === 0 ? (
            <p>No notifications yet.</p>
          ) : (
            items.map((n) => (
              <div key={n.id} className={`notif-card ${n.isRead ? "" : "unread"}`}>
                <div className="module-title-row">
                  <h4>{n.title}</h4>
                  <span className="badge">{n.type}</span>
                </div>
                <p>{n.message}</p>
                <p className="muted">{new Date(n.createdAt).toLocaleString()}</p>
                {!n.isRead ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => markRead(n.id).then(load).catch(() => setErr("Could not update"))}>
                    Mark read
                  </button>
                ) : null}
              </div>
            ))
          )}
        </section>
      </div>
  );
}