/**
 * NotificationOverlayWindow - Dynamic Island-style notification banner
 *
 * Creates frameless, transparent, always-on-top BrowserWindows that display
 * pill-shaped notification banners just below the CoWork OS tray icon.
 * Follows the same pattern as QuickInputWindow (data URL, console-message IPC).
 */

import { BrowserWindow, Rectangle, screen } from "electron";

interface OverlayNotification {
  id: string;
  title: string;
  message: string;
  type?: string;
  taskId?: string;
}

interface ActiveOverlay {
  window: BrowserWindow;
  notification: OverlayNotification;
  dismissTimer: NodeJS.Timeout;
  index: number;
}

const NOTIFICATION_WIDTH = 340;
const NOTIFICATION_HEIGHT = 82;
const GAP = 10;
const MENU_BAR_GAP = 8;
const DISMISS_TIMEOUT = 5000;
const FADE_DURATION = 300;
const MAX_VISIBLE = 5;

export class NotificationOverlayManager {
  private static instance: NotificationOverlayManager | null = null;
  private activeOverlays: Map<string, ActiveOverlay> = new Map();

  // Provider callback so we always get fresh tray bounds (avoids stale-on-init issues)
  private anchorBoundsProvider: (() => Rectangle | null) | null = null;

  private onClickCallback:
    | ((notificationId: string, taskId?: string) => void)
    | null = null;

  static getInstance(): NotificationOverlayManager {
    if (!NotificationOverlayManager.instance) {
      NotificationOverlayManager.instance = new NotificationOverlayManager();
    }
    return NotificationOverlayManager.instance;
  }

  private constructor() {}

  /**
   * Provide a function that returns the current tray icon bounds.
   * Call this once from TrayManager after the Tray is created.
   * Using a callback (not stored bounds) ensures we always get a fresh position.
   */
  setAnchorBoundsProvider(fn: () => Rectangle | null): void {
    this.anchorBoundsProvider = fn;
  }

  setOnClick(
    callback: (notificationId: string, taskId?: string) => void,
  ): void {
    this.onClickCallback = callback;
  }

  show(notification: OverlayNotification): void {
    // Cap visible notifications — dismiss oldest if needed
    if (this.activeOverlays.size >= MAX_VISIBLE) {
      const oldest = this.activeOverlays.values().next().value;
      if (oldest) this.dismiss(oldest.notification.id);
    }

    const win = this.createOverlayWindow(notification);

    const dismissTimer = setTimeout(() => {
      this.dismiss(notification.id);
    }, DISMISS_TIMEOUT);

    this.activeOverlays.set(notification.id, {
      window: win,
      notification,
      dismissTimer,
      index: this.activeOverlays.size,
    });
  }

  dismiss(id: string): void {
    const overlay = this.activeOverlays.get(id);
    if (!overlay) return;

    clearTimeout(overlay.dismissTimer);
    this.activeOverlays.delete(id);

    if (overlay.window && !overlay.window.isDestroyed()) {
      overlay.window.webContents
        .executeJavaScript(`document.getElementById('n').classList.add('out');`)
        .catch(() => {});

      setTimeout(() => {
        if (overlay.window && !overlay.window.isDestroyed()) {
          overlay.window.destroy();
        }
      }, FADE_DURATION);
    }

    this.repositionOverlays();
  }

  dismissAll(): void {
    for (const [id] of this.activeOverlays) {
      this.dismiss(id);
    }
  }

  destroy(): void {
    for (const [, overlay] of this.activeOverlays) {
      clearTimeout(overlay.dismissTimer);
      if (overlay.window && !overlay.window.isDestroyed()) {
        overlay.window.destroy();
      }
    }
    this.activeOverlays.clear();
    NotificationOverlayManager.instance = null;
  }

  private createOverlayWindow(
    notification: OverlayNotification,
  ): BrowserWindow {
    const isMac = process.platform === "darwin";
    const { x, y } = this.getPosition(this.activeOverlays.size);

    const win = new BrowserWindow({
      width: NOTIFICATION_WIDTH,
      height: NOTIFICATION_HEIGHT,
      x,
      y,
      frame: false,
      transparent: isMac,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      backgroundColor: "#00000000",
      show: false,
      fullscreenable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    if (isMac) {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setAlwaysOnTop(true, "floating");
    }

    win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(this.getHtml(notification))}`,
    );

    win.once("ready-to-show", () => {
      win.showInactive();
    });

    win.webContents.on("console-message", (_event, _level, message) => {
      if (message === "__CLICK__") {
        if (this.onClickCallback) {
          this.onClickCallback(notification.id, notification.taskId);
        }
        this.dismiss(notification.id);
      }
    });

    return win;
  }

  private getPosition(stackIndex: number): { x: number; y: number } {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { bounds, workArea } = primaryDisplay;

    // workArea.y is the menu bar height on macOS
    const topY = workArea.y + MENU_BAR_GAP;

    // Get fresh tray bounds via provider callback
    const trayBounds = this.anchorBoundsProvider
      ? this.anchorBoundsProvider()
      : null;

    let centerX: number;
    if (trayBounds) {
      centerX = Math.round(trayBounds.x + trayBounds.width / 2);
    } else {
      // Fallback: right side of screen (typical tray icon area)
      centerX = Math.round(bounds.x + bounds.width * 0.75);
    }

    const x = Math.round(centerX - NOTIFICATION_WIDTH / 2);
    const y = topY + stackIndex * (NOTIFICATION_HEIGHT + GAP);

    return { x, y };
  }

  private repositionOverlays(): void {
    let index = 0;
    for (const [, overlay] of this.activeOverlays) {
      overlay.index = index;
      const { x, y } = this.getPosition(index);
      if (overlay.window && !overlay.window.isDestroyed()) {
        overlay.window.setBounds({
          x,
          y,
          width: NOTIFICATION_WIDTH,
          height: NOTIFICATION_HEIGHT,
        });
      }
      index++;
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private getHtml(notification: OverlayNotification): string {
    const title = this.escapeHtml(notification.title);
    const message = this.escapeHtml(notification.message);
    const radius = NOTIFICATION_HEIGHT / 2;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: transparent;
  }

  body {
    position: relative;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display',
                 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
  }

  /* Keep the blur on a clipped layer instead of the window root to avoid
     Chromium showing the transparent window bounds as a faint rectangle. */
  #n {
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
    height: 100%;
    padding: 0 22px 0 15px;
    border-radius: ${radius}px;
    overflow: hidden;
    isolation: isolate;
    animation: in 0.38s cubic-bezier(0.16, 1, 0.3, 1);
    transform-origin: top center;
  }

  #n::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: rgba(28, 28, 36, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    z-index: -2;
  }

  #n::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow:
      inset 0 0 0 0.5px rgba(255, 255, 255, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    z-index: -1;
    pointer-events: none;
  }

  @keyframes in {
    from { opacity: 0; transform: scaleX(0.72) scaleY(0.4); }
    to   { opacity: 1; transform: scaleX(1)    scaleY(1); }
  }

  body:hover #n::before {
    background: rgba(32, 32, 42, 0.95);
  }

  #n.out {
    animation: out 0.28s cubic-bezier(0.4, 0, 1, 1) forwards;
  }

  @keyframes out {
    to { opacity: 0; transform: scaleY(0.5) scaleX(0.8); }
  }

  .icon {
    width: 52px;
    height: 52px;
    min-width: 52px;
    border-radius: 50%;
    background: linear-gradient(145deg, #0891b2 0%, #22d3ee 55%, #06b6d4 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      0 2px 10px rgba(6, 182, 212, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }

  .icon svg {
    width: 26px;
    height: 26px;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
  }

  .text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .title {
    font-size: 15px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.96);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: -0.2px;
    line-height: 1.35;
    text-shadow: 0 1px 3px rgba(0,0,0,0.4);
  }

  .sub {
    font-size: 13px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
    letter-spacing: -0.1px;
    line-height: 1.35;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
</style>
</head>
<body>
  <div id="n" onclick="console.log('__CLICK__')">
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2.2" y="7.1" width="19.6" height="9.4" rx="1.15" stroke-width="1.7"/>
        <path d="M4.3 16.9c0.45 1 1.25 1.45 2.55 1.45h10.3c1.3 0 2.1-0.45 2.55-1.45" stroke-width="1.5"/>
        <circle cx="17.4" cy="9.95" r="1.02" fill="white" stroke="none"/>
        <circle cx="19.2" cy="9.95" r="0.46" fill="white" stroke="none"/>
      </svg>
    </div>
    <div class="text">
      <div class="title">${title}</div>
      <div class="sub">${message}</div>
    </div>
  </div>
  <script>
    setTimeout(function(){
      document.getElementById('n').classList.add('out');
    }, ${DISMISS_TIMEOUT - FADE_DURATION});
  </script>
</body>
</html>`;
  }
}
