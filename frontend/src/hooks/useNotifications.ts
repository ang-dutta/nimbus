'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { database } from '@/lib/firebase';
import { useAuth } from './useAuth';

export interface RealtimeNotification {
  id: string;
  dbId: string;
  type: string;
  title: string;
  body: string;
  relatedFileId: string | null;
  createdAt: number;
  isRead: boolean;
}

export function useRealtimeNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const notifRef = ref(database, `notifications/${user.uid}`);

    const handleValue = (snapshot: any) => {
      const data = snapshot.val();
      if (!data) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      const items: RealtimeNotification[] = Object.entries(data)
        .map(([key, value]: [string, any]) => ({ ...value, id: key }))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50); // keep latest 50

      setNotifications(items);
      setUnreadCount(items.filter((n) => !n.isRead).length);
    };

    onValue(notifRef, handleValue);
    return () => off(notifRef, 'value', handleValue);
  }, [user]);

  return { notifications, unreadCount };
}
