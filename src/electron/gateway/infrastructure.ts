/**
 * Gateway Infrastructure Service
 *
 * Provides cross-cutting infrastructure features for the channel gateway:
 * - Message queue with persistence and retry
 * - Scheduled messages
 * - Delivery tracking
 * - Rate limiting
 * - Audit logging
 * - Broadcast messaging
 */

import Database from 'better-sqlite3';
import {
  MessageQueueRepository,
  ScheduledMessageRepository,
  DeliveryTrackingRepository,
  RateLimitRepository,
  AuditLogRepository,
  QueuedMessage,
  ScheduledMessage as ScheduledMessageRecord,
  DeliveryRecord,
  AuditLogEntry,
} from '../database/repositories';
import { ChannelAdapter, OutgoingMessage, ChannelType, BroadcastConfig, BroadcastResult } from './channels/types';

/**
 * Infrastructure service configuration
 */
export interface InfrastructureConfig {
  /** Message queue processing interval in ms (default: 1000) */
  queueProcessInterval?: number;
  /** Scheduled message check interval in ms (default: 5000) */
  scheduledCheckInterval?: number;
  /** Rate limit window in ms (default: 60000 = 1 minute) */
  rateLimitWindow?: number;
  /** Default messages per minute limit (default: 30) */
  defaultRateLimit?: number;
  /** Audit log retention in ms (default: 30 days) */
  auditLogRetention?: number;
  /** Delivery tracking retention in ms (default: 7 days) */
  deliveryTrackingRetention?: number;
  /** Message queue retention in ms (default: 24 hours) */
  messageQueueRetention?: number;
}

/**
 * Gateway Infrastructure Service
 */
export class GatewayInfrastructure {
  private queueRepo: MessageQueueRepository;
  private scheduledRepo: ScheduledMessageRepository;
  private deliveryRepo: DeliveryTrackingRepository;
  private rateLimitRepo: RateLimitRepository;
  private auditRepo: AuditLogRepository;

  private adapters: Map<ChannelType, ChannelAdapter> = new Map();
  private config: Required<InfrastructureConfig>;

  private queueInterval: ReturnType<typeof setInterval> | null = null;
  private scheduledInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor(db: Database.Database, config: InfrastructureConfig = {}) {
    this.queueRepo = new MessageQueueRepository(db);
    this.scheduledRepo = new ScheduledMessageRepository(db);
    this.deliveryRepo = new DeliveryTrackingRepository(db);
    this.rateLimitRepo = new RateLimitRepository(db);
    this.auditRepo = new AuditLogRepository(db);

    this.config = {
      queueProcessInterval: config.queueProcessInterval ?? 1000,
      scheduledCheckInterval: config.scheduledCheckInterval ?? 5000,
      rateLimitWindow: config.rateLimitWindow ?? 60000,
      defaultRateLimit: config.defaultRateLimit ?? 30,
      auditLogRetention: config.auditLogRetention ?? 30 * 24 * 60 * 60 * 1000, // 30 days
      deliveryTrackingRetention: config.deliveryTrackingRetention ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      messageQueueRetention: config.messageQueueRetention ?? 24 * 60 * 60 * 1000, // 24 hours
    };
  }

  /**
   * Register a channel adapter for message sending
   */
  registerAdapter(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  /**
   * Start the infrastructure services
   */
  start(): void {
    // Process message queue
    this.queueInterval = setInterval(() => {
      this.processQueue().catch(err => console.error('Queue processing error:', err));
    }, this.config.queueProcessInterval);

    // Process scheduled messages
    this.scheduledInterval = setInterval(() => {
      this.processScheduled().catch(err => console.error('Scheduled processing error:', err));
    }, this.config.scheduledCheckInterval);

    // Cleanup old records (every hour)
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(err => console.error('Cleanup error:', err));
    }, 60 * 60 * 1000);

    this.audit('infrastructure:started', { severity: 'info' });
  }

  /**
   * Stop the infrastructure services
   */
  stop(): void {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }
    if (this.scheduledInterval) {
      clearInterval(this.scheduledInterval);
      this.scheduledInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.audit('infrastructure:stopped', { severity: 'info' });
  }

  // ============================================================================
  // Message Queue
  // ============================================================================

  /**
   * Enqueue a message for reliable delivery
   */
  enqueue(
    channelType: ChannelType,
    chatId: string,
    message: OutgoingMessage,
    options: { priority?: number; maxAttempts?: number; scheduledAt?: number } = {}
  ): QueuedMessage {
    const item = this.queueRepo.enqueue({
      channelType,
      chatId,
      message: message as unknown as Record<string, unknown>,
      priority: options.priority ?? 0,
      maxAttempts: options.maxAttempts ?? 3,
      scheduledAt: options.scheduledAt,
    });

    this.audit('message:queued', {
      channelType,
      chatId,
      details: { queueId: item.id, priority: item.priority },
      severity: 'debug',
    });

    return item;
  }

  /**
   * Process pending messages in the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const pending = this.queueRepo.findPending(10);

      for (const item of pending) {
        const adapter = this.adapters.get(item.channelType as ChannelType);
        if (!adapter || adapter.status !== 'connected') {
          continue;
        }

        // Mark as processing
        this.queueRepo.update(item.id, {
          status: 'processing',
          attempts: item.attempts + 1,
          lastAttemptAt: Date.now(),
        });

        try {
          const message = item.message as unknown as OutgoingMessage;
          const messageId = await adapter.sendMessage(message);

          // Mark as sent
          this.queueRepo.update(item.id, { status: 'sent' });

          // Track delivery
          this.trackDelivery(item.channelType as ChannelType, item.chatId, messageId);

          this.audit('message:sent', {
            channelType: item.channelType,
            chatId: item.chatId,
            details: { queueId: item.id, messageId },
            severity: 'debug',
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          if (item.attempts + 1 >= item.maxAttempts) {
            // Mark as failed
            this.queueRepo.update(item.id, {
              status: 'failed',
              error: errorMessage,
            });

            this.audit('message:failed', {
              channelType: item.channelType,
              chatId: item.chatId,
              details: { queueId: item.id, error: errorMessage, attempts: item.attempts + 1 },
              severity: 'error',
            });
          } else {
            // Reset to pending for retry
            this.queueRepo.update(item.id, {
              status: 'pending',
              error: errorMessage,
            });
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus(): { pending: number; processing: number; sent: number; failed: number } {
    const pending = this.queueRepo.findPending(1000);
    // This is a simplified status - in production you'd have separate count queries
    return {
      pending: pending.length,
      processing: 0, // Would need separate query
      sent: 0, // Would need separate query
      failed: 0, // Would need separate query
    };
  }

  // ============================================================================
  // Scheduled Messages
  // ============================================================================

  /**
   * Schedule a message for future delivery
   */
  schedule(
    channelType: ChannelType,
    chatId: string,
    message: OutgoingMessage,
    scheduledAt: Date | number
  ): ScheduledMessageRecord {
    const timestamp = scheduledAt instanceof Date ? scheduledAt.getTime() : scheduledAt;

    const item = this.scheduledRepo.create({
      channelType,
      chatId,
      message: message as unknown as Record<string, unknown>,
      scheduledAt: timestamp,
    });

    this.audit('message:scheduled', {
      channelType,
      chatId,
      details: { scheduleId: item.id, scheduledAt: new Date(timestamp).toISOString() },
      severity: 'info',
    });

    return item;
  }

  /**
   * Cancel a scheduled message
   */
  cancelScheduled(id: string): boolean {
    const item = this.scheduledRepo.findById(id);
    if (!item || item.status !== 'pending') {
      return false;
    }

    this.scheduledRepo.cancel(id);

    this.audit('message:schedule_cancelled', {
      channelType: item.channelType,
      chatId: item.chatId,
      details: { scheduleId: id },
      severity: 'info',
    });

    return true;
  }

  /**
   * Get scheduled messages for a chat
   */
  getScheduledMessages(channelType: ChannelType, chatId: string): ScheduledMessageRecord[] {
    return this.scheduledRepo.findByChatId(channelType, chatId);
  }

  /**
   * Process due scheduled messages
   */
  private async processScheduled(): Promise<void> {
    const due = this.scheduledRepo.findDue(10);

    for (const item of due) {
      const adapter = this.adapters.get(item.channelType as ChannelType);
      if (!adapter || adapter.status !== 'connected') {
        continue;
      }

      try {
        const message = item.message as unknown as OutgoingMessage;
        const messageId = await adapter.sendMessage(message);

        this.scheduledRepo.update(item.id, {
          status: 'sent',
          sentMessageId: messageId,
        });

        this.audit('message:scheduled_sent', {
          channelType: item.channelType,
          chatId: item.chatId,
          details: { scheduleId: item.id, messageId },
          severity: 'info',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        this.scheduledRepo.update(item.id, {
          status: 'failed',
          error: errorMessage,
        });

        this.audit('message:scheduled_failed', {
          channelType: item.channelType,
          chatId: item.chatId,
          details: { scheduleId: item.id, error: errorMessage },
          severity: 'error',
        });
      }
    }
  }

  // ============================================================================
  // Delivery Tracking
  // ============================================================================

  /**
   * Track a message delivery
   */
  trackDelivery(channelType: ChannelType, chatId: string, messageId: string): DeliveryRecord {
    return this.deliveryRepo.create({
      channelType,
      chatId,
      messageId,
      status: 'sent',
      sentAt: Date.now(),
    });
  }

  /**
   * Update delivery status
   */
  updateDeliveryStatus(
    messageId: string,
    status: 'delivered' | 'read' | 'failed',
    error?: string
  ): void {
    const record = this.deliveryRepo.findByMessageId(messageId);
    if (!record) return;

    const updates: Partial<DeliveryRecord> = { status };

    if (status === 'delivered') {
      updates.deliveredAt = Date.now();
    } else if (status === 'read') {
      updates.readAt = Date.now();
    } else if (status === 'failed') {
      updates.error = error;
    }

    this.deliveryRepo.update(record.id, updates);
  }

  /**
   * Get delivery status for a message
   */
  getDeliveryStatus(messageId: string): DeliveryRecord | undefined {
    return this.deliveryRepo.findByMessageId(messageId);
  }

  /**
   * Get delivery history for a chat
   */
  getDeliveryHistory(channelType: ChannelType, chatId: string, limit = 50): DeliveryRecord[] {
    return this.deliveryRepo.findByChatId(channelType, chatId, limit);
  }

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  /**
   * Check if a user is rate limited
   * Returns true if the user CAN send (not limited), false if limited
   */
  checkRateLimit(channelType: ChannelType, userId: string, limit?: number): boolean {
    const effectiveLimit = limit ?? this.config.defaultRateLimit;
    const record = this.rateLimitRepo.getOrCreate(channelType, userId);
    const now = Date.now();

    // Check if limit has expired
    if (record.isLimited && record.limitExpiresAt && now >= record.limitExpiresAt) {
      this.rateLimitRepo.resetWindow(channelType, userId);
      return true;
    }

    // If already limited, deny
    if (record.isLimited) {
      return false;
    }

    // Check if window has expired
    if (now - record.windowStart >= this.config.rateLimitWindow) {
      this.rateLimitRepo.resetWindow(channelType, userId);
      return true;
    }

    // Check message count
    return record.messageCount < effectiveLimit;
  }

  /**
   * Record a message for rate limiting
   * Returns true if message is allowed, false if rate limited
   */
  recordMessage(channelType: ChannelType, userId: string, limit?: number): boolean {
    const effectiveLimit = limit ?? this.config.defaultRateLimit;
    const record = this.rateLimitRepo.getOrCreate(channelType, userId);
    const now = Date.now();

    // Check if window has expired
    if (now - record.windowStart >= this.config.rateLimitWindow) {
      this.rateLimitRepo.resetWindow(channelType, userId);
      this.rateLimitRepo.update(channelType, userId, { messageCount: 1 });
      return true;
    }

    // Check if limit has expired
    if (record.isLimited && record.limitExpiresAt && now >= record.limitExpiresAt) {
      this.rateLimitRepo.resetWindow(channelType, userId);
      this.rateLimitRepo.update(channelType, userId, { messageCount: 1 });
      return true;
    }

    // If already limited, deny
    if (record.isLimited) {
      this.audit('rate_limit:blocked', {
        channelType,
        userId,
        details: { messageCount: record.messageCount },
        severity: 'warn',
      });
      return false;
    }

    // Increment count
    const newCount = record.messageCount + 1;
    this.rateLimitRepo.update(channelType, userId, { messageCount: newCount });

    // Check if now over limit
    if (newCount >= effectiveLimit) {
      const limitExpiresAt = record.windowStart + this.config.rateLimitWindow;
      this.rateLimitRepo.update(channelType, userId, {
        isLimited: true,
        limitExpiresAt,
      });

      this.audit('rate_limit:applied', {
        channelType,
        userId,
        details: { messageCount: newCount, expiresAt: new Date(limitExpiresAt).toISOString() },
        severity: 'warn',
      });

      return false;
    }

    return true;
  }

  /**
   * Get rate limit status for a user
   */
  getRateLimitStatus(
    channelType: ChannelType,
    userId: string
  ): { isLimited: boolean; remaining: number; resetsAt?: Date } {
    const record = this.rateLimitRepo.getOrCreate(channelType, userId);
    const now = Date.now();

    // Check if window has expired
    if (now - record.windowStart >= this.config.rateLimitWindow) {
      return {
        isLimited: false,
        remaining: this.config.defaultRateLimit,
        resetsAt: new Date(now + this.config.rateLimitWindow),
      };
    }

    return {
      isLimited: record.isLimited,
      remaining: Math.max(0, this.config.defaultRateLimit - record.messageCount),
      resetsAt: new Date(record.windowStart + this.config.rateLimitWindow),
    };
  }

  // ============================================================================
  // Broadcast
  // ============================================================================

  /**
   * Broadcast a message to multiple chats
   */
  async broadcast(config: BroadcastConfig): Promise<BroadcastResult> {
    const adapter = this.adapters.get(config.channel);
    if (!adapter || adapter.status !== 'connected') {
      throw new Error(`Channel ${config.channel} is not connected`);
    }

    const results: BroadcastResult['results'] = [];
    const delay = config.delayBetweenSends ?? 100;

    this.audit('broadcast:started', {
      channelType: config.channel,
      details: { chatCount: config.chatIds.length },
      severity: 'info',
    });

    for (const chatId of config.chatIds) {
      try {
        const messageId = await adapter.sendMessage({
          ...config.message,
          chatId,
        });
        results.push({ chatId, success: true, messageId });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({ chatId, success: false, error: errorMessage });
      }

      // Delay between sends to avoid rate limiting
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    this.audit('broadcast:completed', {
      channelType: config.channel,
      details: { total: config.chatIds.length, sent, failed },
      severity: failed > 0 ? 'warn' : 'info',
    });

    return {
      total: config.chatIds.length,
      sent,
      failed,
      results,
    };
  }

  // ============================================================================
  // Audit Logging
  // ============================================================================

  /**
   * Log an audit entry
   */
  audit(
    action: string,
    options: {
      channelType?: ChannelType | string;
      userId?: string;
      chatId?: string;
      details?: Record<string, unknown>;
      severity?: AuditLogEntry['severity'];
    } = {}
  ): AuditLogEntry {
    return this.auditRepo.log({
      action,
      channelType: options.channelType,
      userId: options.userId,
      chatId: options.chatId,
      details: options.details,
      severity: options.severity ?? 'info',
    });
  }

  /**
   * Search audit logs
   */
  searchAuditLogs(options: {
    action?: string;
    channelType?: string;
    userId?: string;
    chatId?: string;
    fromTimestamp?: number;
    toTimestamp?: number;
    severity?: AuditLogEntry['severity'];
    limit?: number;
    offset?: number;
  }): AuditLogEntry[] {
    return this.auditRepo.find(options);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up old records
   */
  private async cleanup(): Promise<void> {
    const queueDeleted = this.queueRepo.deleteOld(this.config.messageQueueRetention);
    const deliveryDeleted = this.deliveryRepo.deleteOld(this.config.deliveryTrackingRetention);
    const auditDeleted = this.auditRepo.deleteOld(this.config.auditLogRetention);

    if (queueDeleted > 0 || deliveryDeleted > 0 || auditDeleted > 0) {
      console.log(
        `Cleanup: queue=${queueDeleted}, delivery=${deliveryDeleted}, audit=${auditDeleted}`
      );
    }
  }
}
