'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell, Moon, Sun, LogOut, User, Settings, ChevronDown,
  Shield, BarChart2, FileText, Share2, Trash2, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from './ThemeProvider';
import { useRealtimeNotifications } from '@/hooks/useNotifications';
import { formatRelative, truncate } from '@/lib/utils';
import { notificationsApi } from '@/lib/api';

export function Navbar() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { notifications, unreadCount } = useRealtimeNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const router = useRouter();

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  async function markAllRead() {
    await notificationsApi.markAllRead();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <span className="text-xs font-bold text-primary-foreground">N</span>
          </div>
          <span className="font-semibold tracking-tight">nimbus</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden items-center gap-1 md:flex">
          {[
            { href: '/dashboard', label: 'Files', icon: FileText },
            { href: '/dashboard/shared', label: 'Shared', icon: Share2 },
            { href: '/dashboard/security', label: 'Security', icon: Shield },
            { href: '/dashboard/audit', label: 'Audit Log', icon: BarChart2 },
            { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart2 },
            { href: '/dashboard/trash', label: 'Trash', icon: Trash2 },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-1">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 top-10 z-50 w-80 rounded-lg border border-border bg-card shadow-lg animate-slide-in">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <span className="text-sm font-semibold">Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No notifications yet
                      </div>
                    ) : (
                      notifications.slice(0, 10).map((n) => (
                        <div
                          key={n.id}
                          className={`border-b border-border px-4 py-3 last:border-0 ${!n.isRead ? 'bg-primary/5' : ''}`}
                        >
                          <div className="flex items-start gap-2">
                            {n.type === 'anomaly' && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium leading-snug">{n.title}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{truncate(n.body, 80)}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground/70">
                                {formatRelative(new Date(n.createdAt))}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="border-t border-border p-2">
                    <Link
                      href="/dashboard/notifications"
                      onClick={() => setNotifOpen(false)}
                      className="block rounded-md px-3 py-2 text-center text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      View all notifications
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User menu */}
          <div className="relative ml-1">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
            >
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {user?.displayName?.[0] ?? user?.email?.[0] ?? 'U'}
                </div>
              )}
              <span className="hidden max-w-[120px] truncate text-sm md:block">
                {user?.displayName ?? user?.email}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-10 z-50 w-48 rounded-lg border border-border bg-card shadow-lg animate-slide-in">
                  <div className="border-b border-border px-3 py-2">
                    <p className="text-sm font-medium truncate">{user?.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={async () => { await signOut(); router.push('/login'); }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
