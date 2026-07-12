"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  timestamp: string;
  read: boolean;
  resource?: { kind: string; name: string; namespace?: string };
}

export function useNotifications(
  events: Array<{ type: string; resource: { kind: string; name: string; namespace?: string }; timestamp: string }>
) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const processedRef = useRef(new Set<string>());
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      setPermissionGranted(true);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermissionGranted(result === "granted");
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  useEffect(() => {
    if (events.length <= prevCountRef.current) {
      prevCountRef.current = events.length;
      return;
    }
    prevCountRef.current = events.length;

    const newEvents = events.slice(0, events.length - prevCountRef.current + 1);

    for (const event of newEvents) {
      const key = `${event.type}-${event.resource.kind}-${event.resource.name}-${event.timestamp}`;
      if (processedRef.current.has(key)) continue;
      processedRef.current.add(key);

      // Only notify on significant events
      let notification: AppNotification | null = null;

      if (event.type === "DELETED" && event.resource.kind === "Pod") {
        notification = {
          id: key,
          title: "Pod deleted",
          message: `${event.resource.name} in ${event.resource.namespace || "default"}`,
          severity: "warning",
          timestamp: event.timestamp,
          read: false,
          resource: event.resource,
        };
      } else if (event.type === "DELETED" && event.resource.kind === "Deployment") {
        notification = {
          id: key,
          title: "Deployment deleted",
          message: `${event.resource.name} in ${event.resource.namespace || "default"}`,
          severity: "critical",
          timestamp: event.timestamp,
          read: false,
          resource: event.resource,
        };
      } else if (event.type === "ADDED" && event.resource.kind === "Pod") {
        notification = {
          id: key,
          title: "Pod created",
          message: `${event.resource.name} in ${event.resource.namespace || "default"}`,
          severity: "info",
          timestamp: event.timestamp,
          read: false,
          resource: event.resource,
        };
      }

      if (notification) {
        setNotifications((prev) => [notification!, ...prev].slice(0, 50));

        if (permissionGranted && typeof Notification !== "undefined") {
          try {
            new Notification(notification.title, {
              body: notification.message,
              icon: "/favicon.ico",
              tag: notification.id,
            });
          } catch {
            // ignore notification errors
          }
        }
      }
    }

    // Trim processed set to prevent memory leak
    if (processedRef.current.size > 500) {
      const arr = [...processedRef.current];
      processedRef.current = new Set(arr.slice(-200));
    }
  }, [events, permissionGranted]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    permissionGranted,
    requestPermission,
    markRead,
    markAllRead,
    clearAll,
  };
}
