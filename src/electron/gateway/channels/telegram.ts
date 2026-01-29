/**
 * Telegram Channel Adapter
 *
 * Implements the ChannelAdapter interface using grammY for Telegram Bot API.
 * Supports both polling and webhook modes.
 *
 * Features:
 * - API throttling to prevent rate limits
 * - Message deduplication to prevent double processing
 * - Text fragment assembly for split long messages
 * - ACK reactions while processing
 * - Draft streaming for real-time response preview
 */

import { Bot, Context, webhookCallback, InputFile } from 'grammy';
import { apiThrottler } from '@grammyjs/transformer-throttler';
import * as fs from 'fs';
import * as path from 'path';
import {
  ChannelAdapter,
  ChannelStatus,
  IncomingMessage,
  OutgoingMessage,
  MessageHandler,
  ErrorHandler,
  StatusHandler,
  ChannelInfo,
  TelegramConfig,
  MessageAttachment,
} from './types';

/**
 * Extended Telegram configuration with new features
 */
export interface TelegramAdapterConfig extends TelegramConfig {
  /** Enable ACK reaction (👀) while processing messages */
  ackReactionEnabled?: boolean;
  /** Enable draft streaming for real-time response preview */
  draftStreamingEnabled?: boolean;
  /** Text fragment assembly timeout in ms (default: 1500) */
  fragmentAssemblyTimeout?: number;
  /** Enable message deduplication (default: true) */
  deduplicationEnabled?: boolean;
}

/**
 * Pending text fragment for assembly
 */
interface TextFragment {
  chatId: string;
  userId: string;
  messages: Array<{
    messageId: string;
    text: string;
    timestamp: Date;
    ctx: Context;
  }>;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Draft message state for streaming
 */
interface DraftState {
  chatId: string;
  messageId?: string;
  currentText: string;
  lastUpdateTime: number;
}

export class TelegramAdapter implements ChannelAdapter {
  readonly type = 'telegram' as const;

  private bot: Bot | null = null;
  private _status: ChannelStatus = 'disconnected';
  private _botUsername?: string;
  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private config: TelegramAdapterConfig;

  // Message deduplication: track processed update IDs
  private processedUpdates: Map<number, number> = new Map(); // updateId -> timestamp
  private readonly DEDUP_CACHE_TTL = 60000; // 1 minute
  private readonly DEDUP_CACHE_MAX_SIZE = 1000;
  private dedupCleanupTimer?: ReturnType<typeof setTimeout>;

  // Text fragment assembly: buffer split messages
  private pendingFragments: Map<string, TextFragment> = new Map(); // chatId:userId -> fragment
  private readonly DEFAULT_FRAGMENT_TIMEOUT = 1500; // 1.5 seconds

  // Draft streaming state
  private draftStates: Map<string, DraftState> = new Map(); // chatId -> draft state
  private readonly DRAFT_UPDATE_INTERVAL = 500; // Update draft every 500ms

  constructor(config: TelegramAdapterConfig) {
    this.config = {
      deduplicationEnabled: true,
      ackReactionEnabled: true,
      draftStreamingEnabled: true,
      fragmentAssemblyTimeout: 1500,
      ...config,
    };
  }

  get status(): ChannelStatus {
    return this._status;
  }

  get botUsername(): string | undefined {
    return this._botUsername;
  }

  /**
   * Connect to Telegram using long polling
   */
  async connect(): Promise<void> {
    if (this._status === 'connected' || this._status === 'connecting') {
      return;
    }

    this.setStatus('connecting');

    try {
      // Create bot instance
      this.bot = new Bot(this.config.botToken);

      // Feature 5: Add API throttling to prevent rate limits
      const throttler = apiThrottler();
      this.bot.api.config.use(throttler);

      // Get bot info
      const me = await this.bot.api.getMe();
      this._botUsername = me.username;

      // Register bot commands for the "/" menu
      await this.bot.api.setMyCommands([
        { command: 'start', description: 'Start the bot' },
        { command: 'help', description: 'Show available commands' },
        { command: 'workspaces', description: 'List available workspaces' },
        { command: 'workspace', description: 'Select or show current workspace' },
        { command: 'addworkspace', description: 'Add a new workspace by path' },
        { command: 'newtask', description: 'Start a fresh task/conversation' },
        { command: 'provider', description: 'Change or show current LLM provider' },
        { command: 'models', description: 'List available AI models' },
        { command: 'model', description: 'Change or show current model' },
        { command: 'status', description: 'Check bot status' },
        { command: 'cancel', description: 'Cancel current task' },
      ]);

      // Set up message handler with deduplication and fragment assembly
      this.bot.on('message:text', async (ctx) => {
        await this.handleTextMessage(ctx);
      });

      // Handle errors
      this.bot.catch((err) => {
        console.error('Telegram bot error:', err);
        this.handleError(err instanceof Error ? err : new Error(String(err)), 'bot.catch');
      });

      // Start deduplication cleanup timer
      if (this.config.deduplicationEnabled) {
        this.startDedupCleanup();
      }

      // Start polling
      this.bot.start({
        onStart: () => {
          console.log(`Telegram bot @${this._botUsername} started`);
          this.setStatus('connected');
        },
        drop_pending_updates: true,
        allowed_updates: ['message', 'message_reaction'] as const,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.setStatus('error', err);
      throw err;
    }
  }

  /**
   * Handle incoming text message with deduplication and fragment assembly
   */
  private async handleTextMessage(ctx: Context): Promise<void> {
    const msg = ctx.message!;
    const updateId = ctx.update.update_id;

    // Feature 4: Message deduplication - check if already processed
    if (this.config.deduplicationEnabled && this.isUpdateProcessed(updateId)) {
      console.log(`Skipping duplicate update ${updateId}`);
      return;
    }

    // Mark update as processed
    if (this.config.deduplicationEnabled) {
      this.markUpdateProcessed(updateId);
    }

    // Feature 3: Text fragment assembly - buffer split messages
    const fragmentKey = `${msg.chat.id}:${msg.from!.id}`;
    const existingFragment = this.pendingFragments.get(fragmentKey);

    if (existingFragment) {
      // Add to existing fragment
      clearTimeout(existingFragment.timer);
      existingFragment.messages.push({
        messageId: msg.message_id.toString(),
        text: msg.text || '',
        timestamp: new Date(msg.date * 1000),
        ctx,
      });

      // Reset timer
      existingFragment.timer = setTimeout(() => {
        this.processFragments(fragmentKey);
      }, this.config.fragmentAssemblyTimeout || this.DEFAULT_FRAGMENT_TIMEOUT);
    } else {
      // Check if this might be a split message (long text arriving in chunks)
      // Telegram splits messages at ~4096 chars, so check if message ends mid-sentence
      const mightBeSplit = this.mightBeSplitMessage(msg.text || '');

      if (mightBeSplit) {
        // Start new fragment buffer
        const timer = setTimeout(() => {
          this.processFragments(fragmentKey);
        }, this.config.fragmentAssemblyTimeout || this.DEFAULT_FRAGMENT_TIMEOUT);

        this.pendingFragments.set(fragmentKey, {
          chatId: msg.chat.id.toString(),
          userId: msg.from!.id.toString(),
          messages: [{
            messageId: msg.message_id.toString(),
            text: msg.text || '',
            timestamp: new Date(msg.date * 1000),
            ctx,
          }],
          timer,
        });
      } else {
        // Process immediately (single message)
        await this.processMessage(ctx);
      }
    }
  }

  /**
   * Check if a message might be part of a split message
   */
  private mightBeSplitMessage(text: string): boolean {
    // Messages near Telegram's limit or ending abruptly might be split
    if (text.length >= 4000) return true;

    // Check if text ends mid-sentence (no terminal punctuation)
    const trimmed = text.trim();
    if (trimmed.length > 100) {
      const lastChar = trimmed.charAt(trimmed.length - 1);
      const terminalPunctuation = ['.', '!', '?', ')', ']', '}', '"', "'", '`'];
      if (!terminalPunctuation.includes(lastChar)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Process assembled fragments
   */
  private async processFragments(fragmentKey: string): Promise<void> {
    const fragment = this.pendingFragments.get(fragmentKey);
    if (!fragment) return;

    this.pendingFragments.delete(fragmentKey);

    if (fragment.messages.length === 1) {
      // Single message, process normally
      await this.processMessage(fragment.messages[0].ctx);
    } else {
      // Multiple messages, combine them
      const combinedText = fragment.messages
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        .map(m => m.text)
        .join('');

      // Use the first message's context but with combined text
      const firstCtx = fragment.messages[0].ctx;
      const message = this.mapContextToMessage(firstCtx, combinedText);

      console.log(`Assembled ${fragment.messages.length} text fragments into single message (${combinedText.length} chars)`);

      await this.handleIncomingMessage(message);
    }
  }

  /**
   * Process a single message (with ACK reaction)
   */
  private async processMessage(ctx: Context): Promise<void> {
    const message = this.mapContextToMessage(ctx);

    // Feature 2: Send ACK reaction (👀) while processing
    if (this.config.ackReactionEnabled) {
      try {
        await this.sendAckReaction(ctx);
      } catch (err) {
        // Ignore reaction errors (might not have permission)
        console.debug('Could not send ACK reaction:', err);
      }
    }

    await this.handleIncomingMessage(message);
  }

  /**
   * Send ACK reaction (👀) to indicate message received
   */
  private async sendAckReaction(ctx: Context): Promise<void> {
    if (!this.bot || !ctx.message) return;

    try {
      await this.bot.api.setMessageReaction(
        ctx.message.chat.id,
        ctx.message.message_id,
        [{ type: 'emoji', emoji: '👀' }]
      );
    } catch {
      // Silently fail - reactions might not be available
    }
  }

  /**
   * Remove ACK reaction after processing
   */
  async removeAckReaction(chatId: string, messageId: string): Promise<void> {
    if (!this.bot) return;

    try {
      await this.bot.api.setMessageReaction(
        chatId,
        parseInt(messageId, 10),
        [] // Empty array removes reactions
      );
    } catch {
      // Silently fail
    }
  }

  /**
   * Send a completion reaction when done
   * Note: Telegram only allows specific reaction emojis, using 👍 for completion
   */
  async sendCompletionReaction(chatId: string, messageId: string): Promise<void> {
    if (!this.bot) return;

    try {
      await this.bot.api.setMessageReaction(
        chatId,
        parseInt(messageId, 10),
        [{ type: 'emoji', emoji: '👍' }]
      );
    } catch {
      // Silently fail
    }
  }

  /**
   * Check if update was already processed (deduplication)
   */
  private isUpdateProcessed(updateId: number): boolean {
    return this.processedUpdates.has(updateId);
  }

  /**
   * Mark update as processed
   */
  private markUpdateProcessed(updateId: number): void {
    this.processedUpdates.set(updateId, Date.now());

    // Prevent unbounded growth
    if (this.processedUpdates.size > this.DEDUP_CACHE_MAX_SIZE) {
      this.cleanupDedupCache();
    }
  }

  /**
   * Start periodic cleanup of dedup cache
   */
  private startDedupCleanup(): void {
    this.dedupCleanupTimer = setInterval(() => {
      this.cleanupDedupCache();
    }, this.DEDUP_CACHE_TTL);
  }

  /**
   * Clean up old entries from dedup cache
   */
  private cleanupDedupCache(): void {
    const now = Date.now();
    for (const [updateId, timestamp] of this.processedUpdates) {
      if (now - timestamp > this.DEDUP_CACHE_TTL) {
        this.processedUpdates.delete(updateId);
      }
    }
  }

  /**
   * Disconnect from Telegram
   */
  async disconnect(): Promise<void> {
    // Clear timers
    if (this.dedupCleanupTimer) {
      clearInterval(this.dedupCleanupTimer);
      this.dedupCleanupTimer = undefined;
    }

    // Clear pending fragments
    for (const fragment of this.pendingFragments.values()) {
      clearTimeout(fragment.timer);
    }
    this.pendingFragments.clear();

    // Clear draft states
    this.draftStates.clear();

    // Clear dedup cache
    this.processedUpdates.clear();

    if (this.bot) {
      await this.bot.stop();
      this.bot = null;
    }
    this._botUsername = undefined;
    this.setStatus('disconnected');
  }

  /**
   * Send a message to a Telegram chat
   */
  async sendMessage(message: OutgoingMessage): Promise<string> {
    if (!this.bot || this._status !== 'connected') {
      throw new Error('Telegram bot is not connected');
    }

    // Handle image attachments first (send images before text)
    let lastMessageId: string | undefined;
    if (message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        if (attachment.type === 'image' && attachment.url) {
          try {
            // attachment.url is the file path for local images
            const msgId = await this.sendPhoto(message.chatId, attachment.url);
            lastMessageId = msgId;
          } catch (err) {
            console.error('Failed to send image attachment:', err);
          }
        }
      }
    }

    // If we have text to send, send it
    if (message.text && message.text.trim()) {
      // Process text for Telegram compatibility
      let processedText = message.text;
      if (message.parseMode === 'markdown') {
        processedText = this.convertMarkdownForTelegram(message.text);
      }

      const options: Record<string, unknown> = {};

      // Set parse mode
      // Use legacy Markdown (not MarkdownV2) to avoid escaping issues with special characters
      if (message.parseMode === 'markdown') {
        options.parse_mode = 'Markdown';
      } else if (message.parseMode === 'html') {
        options.parse_mode = 'HTML';
      }

      // Reply to message if specified
      if (message.replyTo) {
        options.reply_to_message_id = parseInt(message.replyTo, 10);
      }

      try {
        const sent = await this.bot.api.sendMessage(message.chatId, processedText, options);
        return sent.message_id.toString();
      } catch (error: any) {
        // If markdown parsing fails, retry without parse_mode
        if (error?.error_code === 400 && error?.description?.includes("can't parse entities")) {
          console.log('Markdown parsing failed, retrying without parse_mode');
          const plainOptions: Record<string, unknown> = {};
          if (message.replyTo) {
            plainOptions.reply_to_message_id = parseInt(message.replyTo, 10);
          }
          const sent = await this.bot.api.sendMessage(message.chatId, message.text, plainOptions);
          return sent.message_id.toString();
        }
        throw error;
      }
    }

    // If no text but had attachments, return the last attachment message ID
    return lastMessageId || '';
  }

  /**
   * Feature 1: Draft streaming - Start streaming a response
   * Creates or updates a draft message that shows response as it generates
   */
  async startDraftStream(chatId: string): Promise<void> {
    if (!this.config.draftStreamingEnabled) return;

    this.draftStates.set(chatId, {
      chatId,
      currentText: '',
      lastUpdateTime: Date.now(),
    });
  }

  /**
   * Update draft stream with new content
   */
  async updateDraftStream(chatId: string, text: string): Promise<void> {
    if (!this.bot || !this.config.draftStreamingEnabled) return;

    const state = this.draftStates.get(chatId);
    if (!state) return;

    const now = Date.now();

    // Throttle updates to prevent API spam
    if (now - state.lastUpdateTime < this.DRAFT_UPDATE_INTERVAL) {
      // Just update the text, don't send yet
      state.currentText = text;
      return;
    }

    // Add typing indicator suffix
    const displayText = text + ' ▌';

    try {
      if (state.messageId) {
        // Edit existing message
        await this.bot.api.editMessageText(
          chatId,
          parseInt(state.messageId, 10),
          displayText
        );
      } else {
        // Create new message
        const sent = await this.bot.api.sendMessage(chatId, displayText);
        state.messageId = sent.message_id.toString();
      }

      state.currentText = text;
      state.lastUpdateTime = now;
    } catch (error: any) {
      // Ignore "message not modified" errors
      if (!error?.description?.includes('message is not modified')) {
        console.error('Draft stream update error:', error);
      }
    }
  }

  /**
   * Finalize draft stream with final content
   */
  async finalizeDraftStream(chatId: string, finalText: string): Promise<string> {
    if (!this.bot) throw new Error('Bot not connected');

    const state = this.draftStates.get(chatId);
    this.draftStates.delete(chatId);

    if (!this.config.draftStreamingEnabled || !state?.messageId) {
      // No draft exists, send as new message
      const sent = await this.bot.api.sendMessage(chatId, finalText);
      return sent.message_id.toString();
    }

    try {
      // Edit the draft message to final content (remove typing indicator)
      await this.bot.api.editMessageText(
        chatId,
        parseInt(state.messageId, 10),
        finalText
      );
      return state.messageId;
    } catch (error: any) {
      // If edit fails, send as new message
      console.error('Failed to finalize draft, sending new message:', error);
      const sent = await this.bot.api.sendMessage(chatId, finalText);
      return sent.message_id.toString();
    }
  }

  /**
   * Cancel draft stream (delete the draft message)
   */
  async cancelDraftStream(chatId: string): Promise<void> {
    const state = this.draftStates.get(chatId);
    this.draftStates.delete(chatId);

    if (state?.messageId && this.bot) {
      try {
        await this.bot.api.deleteMessage(chatId, parseInt(state.messageId, 10));
      } catch {
        // Ignore deletion errors
      }
    }
  }

  /**
   * Send typing indicator
   */
  async sendTyping(chatId: string): Promise<void> {
    if (!this.bot) return;

    try {
      await this.bot.api.sendChatAction(chatId, 'typing');
    } catch {
      // Ignore errors
    }
  }

  /**
   * Convert GitHub-flavored markdown to Telegram-compatible format
   * Telegram legacy Markdown only supports: *bold*, _italic_, `code`, ```code blocks```, [links](url)
   */
  private convertMarkdownForTelegram(text: string): string {
    let result = text;

    // Convert markdown headers (## Header) to bold (*Header*)
    // Must be done before ** conversion
    result = result.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

    // Convert markdown tables to code blocks
    // Tables start with | and have a separator line like |---|---|
    const tableRegex = /(\|[^\n]+\|\n)+/g;
    const hasSeparatorLine = /\|[\s-:]+\|/;

    result = result.replace(tableRegex, (match) => {
      // Check if this looks like a table (has separator line with dashes)
      if (hasSeparatorLine.test(match)) {
        // Convert table to code block for monospace display
        // Remove the separator line (|---|---|) as it's just formatting
        const lines = match.split('\n').filter(line => line.trim());
        const cleanedLines = lines.filter(line => !(/^\|[\s-:]+\|$/.test(line.trim())));

        // Format table nicely
        const formattedTable = cleanedLines.map(line => {
          // Remove leading/trailing pipes and clean up
          return line.replace(/^\||\|$/g, '').trim();
        }).join('\n');

        return '```\n' + formattedTable + '\n```\n';
      }
      return match;
    });

    // Convert **bold** to *bold* (Telegram uses single asterisk)
    result = result.replace(/\*\*([^*]+)\*\*/g, '*$1*');

    // Convert __bold__ to *bold* (alternative bold syntax)
    result = result.replace(/__([^_]+)__/g, '*$1*');

    // Convert horizontal rules (---, ***) to a line
    result = result.replace(/^[-*]{3,}$/gm, '─────────────────');

    return result;
  }

  /**
   * Edit an existing message
   */
  async editMessage(chatId: string, messageId: string, text: string): Promise<void> {
    if (!this.bot || this._status !== 'connected') {
      throw new Error('Telegram bot is not connected');
    }

    const msgId = parseInt(messageId, 10);
    if (isNaN(msgId)) {
      throw new Error(`Invalid message ID: ${messageId}`);
    }

    await this.bot.api.editMessageText(chatId, msgId, text);
  }

  /**
   * Delete a message
   */
  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    if (!this.bot || this._status !== 'connected') {
      throw new Error('Telegram bot is not connected');
    }

    const msgId = parseInt(messageId, 10);
    if (isNaN(msgId)) {
      throw new Error(`Invalid message ID: ${messageId}`);
    }

    await this.bot.api.deleteMessage(chatId, msgId);
  }

  /**
   * Send a document/file to a chat
   */
  async sendDocument(chatId: string, filePath: string, caption?: string): Promise<string> {
    if (!this.bot || this._status !== 'connected') {
      throw new Error('Telegram bot is not connected');
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);

    const sent = await this.bot.api.sendDocument(
      chatId,
      new InputFile(fileBuffer, fileName),
      { caption }
    );

    return sent.message_id.toString();
  }

  /**
   * Send a photo/image to a chat
   */
  async sendPhoto(chatId: string, filePath: string, caption?: string): Promise<string> {
    if (!this.bot || this._status !== 'connected') {
      throw new Error('Telegram bot is not connected');
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);

    const sent = await this.bot.api.sendPhoto(
      chatId,
      new InputFile(fileBuffer, fileName),
      { caption }
    );

    return sent.message_id.toString();
  }

  /**
   * Register a message handler
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Register an error handler
   */
  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Register a status change handler
   */
  onStatusChange(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
  }

  /**
   * Get channel info
   */
  async getInfo(): Promise<ChannelInfo> {
    let botId: string | undefined;
    let botDisplayName: string | undefined;

    if (this.bot && this._status === 'connected') {
      try {
        const me = await this.bot.api.getMe();
        botId = me.id.toString();
        botDisplayName = me.first_name;
        this._botUsername = me.username;
      } catch {
        // Ignore errors getting info
      }
    }

    return {
      type: 'telegram',
      status: this._status,
      botId,
      botUsername: this._botUsername,
      botDisplayName,
    };
  }

  /**
   * Get webhook callback for Express/Fastify/etc.
   * Use this when running in webhook mode instead of polling.
   */
  getWebhookCallback(): (req: Request, res: Response) => Promise<void> {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }
    return webhookCallback(this.bot, 'express') as unknown as (req: Request, res: Response) => Promise<void>;
  }

  /**
   * Set webhook URL
   */
  async setWebhook(url: string, secretToken?: string): Promise<void> {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }

    await this.bot.api.setWebhook(url, {
      secret_token: secretToken,
      allowed_updates: ['message'] as const,
    });
  }

  /**
   * Remove webhook
   */
  async deleteWebhook(): Promise<void> {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }

    await this.bot.api.deleteWebhook();
  }

  // Private methods

  private mapContextToMessage(ctx: Context, overrideText?: string): IncomingMessage {
    const msg = ctx.message!;
    const from = msg.from!;
    const chat = msg.chat;

    return {
      messageId: msg.message_id.toString(),
      channel: 'telegram',
      userId: from.id.toString(),
      userName: from.first_name + (from.last_name ? ` ${from.last_name}` : ''),
      chatId: chat.id.toString(),
      text: overrideText ?? msg.text ?? '',
      timestamp: new Date(msg.date * 1000),
      replyTo: msg.reply_to_message?.message_id.toString(),
      raw: ctx,
    };
  }

  private async handleIncomingMessage(message: IncomingMessage): Promise<void> {
    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (error) {
        console.error('Error in message handler:', error);
        this.handleError(
          error instanceof Error ? error : new Error(String(error)),
          'messageHandler'
        );
      }
    }
  }

  private handleError(error: Error, context?: string): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error, context);
      } catch (e) {
        console.error('Error in error handler:', e);
      }
    }
  }

  private setStatus(status: ChannelStatus, error?: Error): void {
    this._status = status;
    for (const handler of this.statusHandlers) {
      try {
        handler(status, error);
      } catch (e) {
        console.error('Error in status handler:', e);
      }
    }
  }
}

/**
 * Create a Telegram adapter from configuration
 */
export function createTelegramAdapter(config: TelegramAdapterConfig): TelegramAdapter {
  if (!config.botToken) {
    throw new Error('Telegram bot token is required');
  }
  return new TelegramAdapter(config);
}
