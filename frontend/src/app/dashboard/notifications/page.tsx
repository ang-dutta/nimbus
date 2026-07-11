'use client';

import { useEffect, useState } from 'react';
import { Loader2, Bell, CheckCheck, AlertTriangle, Share2, Shield, Upload, RotateCcw } from 'lucide-react';
import { Notification, notificationsApi } from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { cn } from '@/lib/utils';

const TYPE_ICONS: Record<string, React.ElementType> = {
  anomaly: AlertTriangle,
  share_accessed: Share2,
  scan_flagged: Shield,
  file_restore: RotateCcw,
  version_restore: RotateCcw,
  quota_warning: Upload,
};

const TYPE_COLORS: Record<string, string> = {
  anomaly: 'text-orange-500',
  scan_flagged: 'text-red-500',
  quota_warning: 'text-yellow-500',
  share_accessed: 'text-blue-500',
  file_restore: 'text-emerald-500',
  version_restore: 'text-emerald-500',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await notificationsApi.list();
      setNotifications(r.notifications);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleMarkRead(id: string) {
    await notificationsApi.markRead(id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } finally {
      setMarkingAll(false);
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Notifications</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {markingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Bell className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">No notifications yet</p>
          <p className="mt-1 text-xs text-muted-foreground">You'll be notified about file activity, security alerts, and more</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {notifications.map((n) => {
            const Icon = TYPE_ICONS[n.type] ?? Bell;
            const iconColor = TYPE_COLORS[n.type] ?? 'text-muted-foreground';

            return (
              <div
                key={n.id}
                className={cn(
                  'flex items-start gap-4 px-5 py-4 transition-colors',
                  !n.is_read ? 'bg-primary/5 hover:bg-primary/8' : 'hover:bg-muted/20'
                )}
                onClick={() => !n.is_read && handleMarkRead(n.id)}
              >
                <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', !n.is_read ? 'bg-primary/10' : 'bg-muted')}>
                  <Icon className={cn('h-4 w-4', iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn('text-sm leading-snug', !n.is_read ? 'font-semibold' : 'font-medium')}>
                      {n.title}
                    </p>
                    {!n.is_read && (
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground leading-relaxed">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">{formatRelative(n.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
