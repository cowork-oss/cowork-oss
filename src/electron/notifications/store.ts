/**
 * Notification Store - File-based persistence for in-app notifications
 * Uses atomic writes with temporary files for data safety
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AppNotification, NotificationStoreFile } from '../../shared/types';

// Lazy-evaluated paths (app.getPath() is not available until app is ready)
let _notificationDir: string | null = null;
let _notificationStorePath: string | null = null;

export function getNotificationDir(): string {
  if (!_notificationDir) {
    _notificationDir = path.join(app.getPath('userData'), 'notifications');
  }
  return _notificationDir;
}

export function getNotificationStorePath(): string {
  if (!_notificationStorePath) {
    _notificationStorePath = path.join(getNotificationDir(), 'notifications.json');
  }
  return _notificationStorePath;
}

// Legacy exports - these are getters that evaluate lazily
// eslint-disable-next-line @typescript-eslint/naming-convention
export const DEFAULT_NOTIFICATION_DIR = '' as string; // Placeholder, use getNotificationDir()
// eslint-disable-next-line @typescript-eslint/naming-convention
export const DEFAULT_NOTIFICATION_STORE_PATH = '' as string; // Placeholder, use getNotificationStorePath()

// Maximum notifications to keep (to prevent unbounded growth)
const MAX_NOTIFICATIONS = 100;

/**
 * Load notifications from the store file
 * Returns empty array if file doesn't exist or is invalid
 */
export async function loadNotificationStore(storePath?: string): Promise<NotificationStoreFile> {
  const effectivePath = storePath || getNotificationStorePath();
  try {
    const raw = await fs.promises.readFile(effectivePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<NotificationStoreFile> | null;
    const notifications = Array.isArray(parsed?.notifications) ? parsed.notifications : [];

    // Validate and filter notifications
    const validNotifications = notifications.filter((n): n is AppNotification => {
      return (
        n &&
        typeof n === 'object' &&
        typeof n.id === 'string' &&
        typeof n.type === 'string' &&
        typeof n.title === 'string' &&
        typeof n.message === 'string' &&
        typeof n.read === 'boolean' &&
        typeof n.createdAt === 'number'
      );
    });

    return {
      version: 1,
      notifications: validNotifications,
    };
  } catch {
    // File doesn't exist or is invalid - return empty store
    return { version: 1, notifications: [] };
  }
}

/**
 * Load notification store synchronously (for initialization)
 */
export function loadNotificationStoreSync(storePath?: string): NotificationStoreFile {
  const effectivePath = storePath || getNotificationStorePath();
  try {
    const raw = fs.readFileSync(effectivePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<NotificationStoreFile> | null;
    const notifications = Array.isArray(parsed?.notifications) ? parsed.notifications : [];

    // Validate and filter notifications
    const validNotifications = notifications.filter((n): n is AppNotification => {
      return (
        n &&
        typeof n === 'object' &&
        typeof n.id === 'string' &&
        typeof n.type === 'string' &&
        typeof n.title === 'string' &&
        typeof n.message === 'string' &&
        typeof n.read === 'boolean' &&
        typeof n.createdAt === 'number'
      );
    });

    return {
      version: 1,
      notifications: validNotifications,
    };
  } catch {
    return { version: 1, notifications: [] };
  }
}

/**
 * Save notifications to the store file
 * Uses atomic writes to prevent data corruption
 */
export async function saveNotificationStore(
  store: NotificationStoreFile,
  storePath?: string
): Promise<void> {
  const effectivePath = storePath || getNotificationStorePath();
  // Ensure directory exists
  await fs.promises.mkdir(path.dirname(effectivePath), { recursive: true });

  // Trim to max notifications (keep most recent)
  if (store.notifications.length > MAX_NOTIFICATIONS) {
    store.notifications = store.notifications
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_NOTIFICATIONS);
  }

  // Generate temp file path with process ID and random suffix
  const tmp = `${effectivePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;

  // Write to temp file
  const json = JSON.stringify(store, null, 2);
  await fs.promises.writeFile(tmp, json, 'utf-8');

  // Atomic rename
  await fs.promises.rename(tmp, effectivePath);
}

/**
 * Save notification store synchronously
 */
export function saveNotificationStoreSync(
  store: NotificationStoreFile,
  storePath?: string
): void {
  const effectivePath = storePath || getNotificationStorePath();
  // Ensure directory exists
  fs.mkdirSync(path.dirname(effectivePath), { recursive: true });

  // Trim to max notifications (keep most recent)
  if (store.notifications.length > MAX_NOTIFICATIONS) {
    store.notifications = store.notifications
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_NOTIFICATIONS);
  }

  // Generate temp file path
  const tmp = `${effectivePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;

  // Write to temp file
  const json = JSON.stringify(store, null, 2);
  fs.writeFileSync(tmp, json, 'utf-8');

  // Atomic rename
  fs.renameSync(tmp, effectivePath);
}
