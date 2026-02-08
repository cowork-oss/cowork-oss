/**
 * Channel Message Templates
 *
 * Personality-based message templates for messaging channels (Telegram, WhatsApp, Slack, etc.)
 * These messages are used when sending task status updates to external channels.
 *
 * This file is in shared/ so it can be used by both the main process (gateway) and renderer.
 */

import type { PersonalityId, PersonaId, EmojiUsage, PersonalityQuirks } from './types';

/**
 * Message keys for channel notifications
 */
export type ChannelMessageKey =
  | 'taskComplete'
  | 'taskCompleteWithResult'
  | 'taskFailed'
  | 'toolError'
  | 'followUpProcessed'
  | 'followUpFailed'
  | 'approvalNeeded';

/**
 * Context for generating personalized channel messages
 */
export interface ChannelMessageContext {
  agentName: string;
  userName?: string;
  personality: PersonalityId;
  persona?: PersonaId;
  emojiUsage: EmojiUsage;
  quirks: PersonalityQuirks;
}

/**
 * UI copy keys for channel interfaces (commands, onboarding, system messages)
 */
export type ChannelUiKey =
  | 'welcomeStandard'
  | 'welcomeBack'
  | 'welcomeNoWorkspace'
  | 'welcomeSingleWorkspace'
  | 'welcomeSelectWorkspace'
  | 'workspaceSelected'
  | 'workspaceSelectedExample'
  | 'unauthorized'
  | 'pairingRequired'
  | 'pairingPrompt'
  | 'pairingSuccess'
  | 'pairingFailed'
  | 'unknownCommand'
  | 'statusHeader'
  | 'statusNoWorkspace'
  | 'statusActiveTask'
  | 'workspacesNone'
  | 'workspacesHeader'
  | 'workspacesFooter'
  | 'workspacesSelectPrompt'
  | 'workspaceCurrent'
  | 'workspaceNoneSelected'
  | 'workspaceNotFound'
  | 'workspaceNotFoundShort'
  | 'workspaceSet'
  | 'workspaceAddUsage'
  | 'workspacePathNotDir'
  | 'workspacePathNotFound'
  | 'workspaceAlreadyExists'
  | 'workspaceAdded'
  | 'workspaceRemoveUsage'
  | 'workspaceRemoved'
  | 'taskStartAck'
  | 'taskStartAckSimple'
  | 'taskStartFailed'
  | 'taskContinueFailed'
  | 'agentUnavailable'
  | 'workspaceMissingForTask'
  | 'approvalNone'
  | 'approvalApproved'
  | 'approvalDenied'
  | 'approvalFailed'
  | 'approvalButtonApprove'
  | 'approvalButtonDeny'
  | 'approvalRequiredTitle'
  | 'queueCleared'
  | 'queueStatus'
  | 'cancelled'
  | 'cancelNoActive'
  | 'newTaskReady'
  | 'retryNone'
  | 'retrying'
  | 'historyNone'
  | 'historyHeader'
  | 'skillsNone'
  | 'skillsLoadFailed'
  | 'skillSpecify'
  | 'skillNotFound'
  | 'skillToggle'
  | 'debugStatus'
  | 'shellInvalidOption'
  | 'workspaceNotFoundForShell'
  | 'responseFailed'
  | 'helpCompact'
  | 'helpFull';

const CHANNEL_UI_COPY: Record<ChannelUiKey, string> = {
  welcomeStandard: '👋 Welcome to CoWork! Send me a task whenever you are ready.',
  welcomeBack: '👋 Welcome back!\n\nWorkspace: *{workspaceName}*\n\nSend me what you want to do.\n\nType /help for commands.',
  welcomeNoWorkspace: '👋 Welcome to CoWork!\n\nFirst, add a workspace:\n`/addworkspace /path/to/project`\n\nOr add one from the desktop app.',
  welcomeSingleWorkspace: '👋 Welcome to CoWork!\n\n✅ Workspace: *{workspaceName}*\n\nTell me what you want to do.\n\nExamples:\n• "Add dark mode support"\n• "Fix the login bug"\n• "Create a new API endpoint"',
  welcomeSelectWorkspace: '👋 Welcome to CoWork!\n\nSelect a workspace to start:\n\n{workspaceList}\nReply with a number (e.g., `1`)',
  workspaceSelected: '✅ *{workspaceName}* selected!',
  workspaceSelectedExample: 'You can now send tasks.\n\nExample: "Create a new React component called Button"',
  unauthorized: '⚠️ You are not authorized to use this bot. Please contact the administrator.',
  pairingRequired: '🔐 Please enter your pairing code to get started.',
  pairingPrompt: '🔐 Please provide a pairing code.\n\nUsage: `/pair <code>`',
  pairingSuccess: '✅ Pairing successful! You can now use the bot.',
  pairingFailed: '❌ {error}',
  unknownCommand: 'Unknown command: {command}\n\nUse /help to see available commands.',
  statusHeader: 'Online and ready.',
  statusNoWorkspace: '⚠️ No workspace selected. Use /workspaces to see available workspaces.',
  statusActiveTask: '🔄 Active task: {taskTitle} ({status})',
  workspacesNone: '📁 No workspaces configured yet.\n\nAdd a workspace in the CoWork desktop app first, or use:\n`/addworkspace /path/to/your/project`',
  workspacesHeader: '📁 *Available Workspaces*',
  workspacesFooter: 'Reply with the number or name to select.\nExample: `1` or `myproject`',
  workspacesSelectPrompt: 'Tap a workspace to select it:',
  workspaceCurrent: '📁 Current workspace: *{workspaceName}*\n`{workspacePath}`\n\nUse `/workspaces` to see available workspaces.',
  workspaceNoneSelected: 'No workspace selected. Use `/workspaces` to see available workspaces.',
  workspaceNotFound: '❌ Workspace not found: "{selector}"\n\nUse /workspaces to see available workspaces.',
  workspaceNotFoundShort: '❌ Workspace not found.',
  workspaceSet: '✅ Workspace set to: *{workspaceName}*\n`{workspacePath}`\n\nYou can now send messages to create tasks in this workspace.',
  workspaceAddUsage: '📁 *Add Workspace*\n\nUsage: `/addworkspace <path>`\n\nExample:\n`/addworkspace /Users/john/projects/myapp`\n`/addworkspace ~/Documents`',
  workspacePathNotDir: '❌ Path is not a directory: `{workspacePath}`',
  workspacePathNotFound: '❌ Directory not found: `{workspacePath}`',
  workspaceAlreadyExists: '📁 Workspace already exists!\n\n✅ Selected: *{workspaceName}*\n`{workspacePath}`',
  workspaceAdded: '✅ Workspace added and selected!\n\n📁 *{workspaceName}*\n`{workspacePath}`\n\nYou can now send messages to create tasks in this workspace.',
  workspaceRemoveUsage: '❌ Please specify a workspace name to remove.\n\nUsage: `/removeworkspace <name>`',
  workspaceRemoved: '✅ Workspace "{workspaceName}" removed successfully.',
  taskStartAck: '🚀 Task started: "{taskTitle}"\n\nI\'ll update you when it\'s ready or if I need your input.',
  taskStartAckSimple: 'I\'m on it — I\'ll check back soon.',
  taskStartFailed: '❌ Failed to start task: {error}',
  taskContinueFailed: '❌ Failed to send message. Use /newtask to start a new task.',
  agentUnavailable: '❌ Agent not available. Please try again later.',
  workspaceMissingForTask: '❌ Workspace not found. Please select a workspace with /workspace.',
  approvalNone: '❌ No pending approval request.',
  approvalApproved: '✅ Approved. Working on it.',
  approvalDenied: '🛑 Denied. Action cancelled.',
  approvalFailed: '❌ Failed to process approval.',
  approvalButtonApprove: '✅ Approve',
  approvalButtonDeny: '❌ Deny',
  approvalRequiredTitle: 'Approval Required',
  queueCleared: '✅ Queue cleared.\n\n• Running tasks cancelled: {running}\n• Queued tasks removed: {queued}\n\nBrowser sessions and other resources have been cleaned up.',
  queueStatus: '{statusText}',
  cancelled: '🛑 Task cancelled.',
  cancelNoActive: 'No active task to cancel.',
  newTaskReady: '🆕 Ready for a new task.\n\nSend me a message describing what you want to do.',
  retryNone: '❌ No failed task found to retry.\n\nStart a new task by sending a message.',
  retrying: '🔄 Retrying task...\n\nOriginal prompt: "{taskTitle}"',
  historyNone: '📋 No task history found.\n\nStart a new task by sending a message.',
  historyHeader: '📋 *Recent Tasks*\n\n{history}',
  skillsNone: '📚 No skills available.\n\nSkills are stored in:\n`~/Library/Application Support/cowork-os/skills/`',
  skillsLoadFailed: '❌ Failed to load skills.',
  skillSpecify: '❌ Please specify a skill ID.\n\nUsage: `/skill <id>`\n\nUse /skills to see available skills.',
  skillNotFound: '❌ Skill "{skillId}" not found.\n\nUse /skills to see available skills.',
  skillToggle: '{emoji} *{skillName}* is now {statusText}',
  debugStatus: '🐛 Debug mode is now {statusText}',
  shellInvalidOption: '❌ Invalid option. Use `/shell on` or `/shell off`',
  workspaceNotFoundForShell: '❌ Workspace not found.',
  responseFailed: '❌ Failed to process response.',
  helpCompact: `📚 *Commands*

*Basics*
/workspaces - Select workspace
/brief [today|tomorrow|week] - Brief (DM only)
/brief schedule|list|unschedule - Brief scheduling (DM only)
/schedule - Schedule a task
/digest [lookback] - Digest recent chat
/followups [lookback] - Follow-ups/commitments
/status - Current status
/newtask - Fresh start

*Tasks*
/cancel - Stop task
/approve or /yes - Approve action
/deny or /no - Reject action

*Settings*
/shell on|off - Shell access
/models - Change AI model

━━━━━━━━━━━━━━━
💡 Just send your task directly!
Example: "Add a login form"`,
  helpFull: `📚 *Available Commands*

*Core*
/start - Start the bot
/help - Show this help message
/status - Check bot status and workspace
/version - Show version information

*Workspaces*
/workspaces - List available workspaces
/workspace <name> - Select a workspace
/addworkspace <path> - Add a new workspace
/removeworkspace <name> - Remove a workspace

*Tasks*
/newtask - Start a fresh task/conversation
/brief [today|tomorrow|week] - Generate a brief summary (DM only)
/brief schedule ... - Schedule a recurring brief (DM only)
/brief list - List scheduled briefs (DM only)
/brief unschedule [today|tomorrow|week] - Disable scheduled briefs (DM only)
/schedule help - Scheduling help
/schedule list - List scheduled tasks for this chat
/digest - Digest recent chat
/followups - Extract follow-ups/commitments
/cancel - Cancel current task
/retry - Retry the last failed task
/history - Show recent task history
/approve - Approve pending action (or /yes, /y)
/deny - Reject pending action (or /no, /n)
/queue - View/clear task queue

*Models*
/providers - List available AI providers
/provider <name> - Show or change provider
/models - List available AI models
/model <name> - Show or change model

*Skills*
/skills - List available skills
/skill <name> - Toggle a skill on/off

*Settings*
/settings - View current settings
/shell - Enable/disable shell commands
/debug - Toggle debug mode

💬 *Quick Start*
1. \`/workspaces\` → \`/workspace <name>\`
2. \`/shell on\` (if needed)
3. Send your task message
4. \`/newtask\` to start fresh`,
};

const PERSONA_CHANNEL_UI_OVERRIDES: Partial<Record<PersonaId, Partial<Record<ChannelUiKey, string>>>> = {
  companion: {
    welcomeStandard: '👋 I\'m here. Send me a task whenever you\'re ready.',
    welcomeBack: '👋 Welcome back.\n\nWorkspace: *{workspaceName}*\n\nTell me what you want to do.\n\nType /help for commands.',
    welcomeNoWorkspace: '👋 I\'m here.\n\nAdd a workspace to begin:\n`/addworkspace /path/to/project`\n\nOr add one from the desktop app.',
    welcomeSingleWorkspace: '👋 We\'re set.\n\n✅ Workspace: *{workspaceName}*\n\nTell me what you want to do.\n\nExamples:\n• "Add dark mode support"\n• "Fix the login bug"\n• "Create a new API endpoint"',
    welcomeSelectWorkspace: '👋 Let\'s pick a workspace:\n\n{workspaceList}\nReply with a number (e.g., `1`)',
    workspaceSelected: '✅ *{workspaceName}* selected.',
    workspaceSelectedExample: 'You can send tasks now.\n\nExample: "Create a new React component called Button"',
    pairingPrompt: '🔐 Share your pairing code so I can connect.\n\nUsage: `/pair <code>`',
    pairingSuccess: '✅ Paired. I\'m ready.',
    pairingFailed: '❌ {error}',
    unknownCommand: 'I didn\'t recognize that command: {command}\n\nUse /help to see options.',
    statusHeader: 'Here and ready.',
    statusNoWorkspace: '⚠️ No workspace selected. Use /workspaces to choose one.',
    workspacesNone: '📁 No workspaces yet.\n\nAdd one in the desktop app, or use:\n`/addworkspace /path/to/your/project`',
    workspacesHeader: '📁 *Workspaces*',
    workspacesFooter: 'Reply with a number or name.\nExample: `1` or `myproject`',
    workspaceCurrent: '📁 Current workspace: *{workspaceName}*\n`{workspacePath}`\n\nUse `/workspaces` to switch.',
    workspaceNoneSelected: 'No workspace selected yet. Use `/workspaces` to pick one.',
    workspaceNotFound: '❌ I couldn\'t find "{selector}".\n\nUse /workspaces to see available workspaces.',
    workspaceNotFoundShort: 'I couldn\'t find that workspace.',
    workspaceSet: '✅ Workspace set: *{workspaceName}*\n`{workspacePath}`\n\nSend a message to start a task.',
    workspaceAddUsage: '📁 *Add Workspace*\n\nUsage: `/addworkspace <path>`\n\nExample:\n`/addworkspace /Users/john/projects/myapp`\n`/addworkspace ~/Documents`',
    workspaceAlreadyExists: '📁 Workspace already exists.\n\n✅ Selected: *{workspaceName}*\n`{workspacePath}`',
    workspaceAdded: '✅ Workspace added and selected.\n\n📁 *{workspaceName}*\n`{workspacePath}`\n\nSend a message to start a task.',
    workspaceRemoveUsage: 'Please specify a workspace name to remove.\n\nUsage: `/removeworkspace <name>`',
    workspaceRemoved: 'Workspace "{workspaceName}" removed.',
    taskStartAck: 'I\'m on it — "{taskTitle}".\n\nI\'ll check back soon or ask if I need input.',
    taskStartAckSimple: 'I\'m on it. I\'ll check back soon.',
    taskContinueFailed: 'I couldn\'t send that. Use /newtask to start fresh.',
    agentUnavailable: 'I\'m not available right now. Try again in a moment.',
    workspaceMissingForTask: 'I can\'t find a workspace. Use /workspace to select one.',
    approvalNone: 'No pending approval right now.',
    approvalApproved: 'Approved. I\'m working on it.',
    approvalDenied: 'Okay. I cancelled that.',
    approvalFailed: 'I couldn\'t process that approval.',
    approvalButtonApprove: 'Approve',
    approvalButtonDeny: 'Deny',
    approvalRequiredTitle: 'Approval required',
    queueCleared: 'Queue cleared.\n\n• Running tasks cancelled: {running}\n• Queued tasks removed: {queued}\n\nYou can start new tasks now.',
    cancelled: 'Task cancelled.',
    cancelNoActive: 'No active task to cancel.',
    newTaskReady: 'Ready for a fresh task.\n\nSend me what you want to do.',
    retryNone: 'No failed task to retry.\n\nSend a new task when you\'re ready.',
    retrying: 'Retrying...\n\nOriginal prompt: "{taskTitle}"',
    historyNone: 'No recent task history yet.',
    historyHeader: 'Recent tasks:\n\n{history}',
    skillsNone: 'No skills available yet.',
    skillsLoadFailed: 'Couldn\'t load skills.',
    skillSpecify: 'Please specify a skill ID.\n\nUsage: `/skill <id>`\n\nUse /skills to see available skills.',
    skillNotFound: 'Skill "{skillId}" not found.\n\nUse /skills to see available skills.',
    skillToggle: '{emoji} *{skillName}* is now {statusText}',
    debugStatus: 'Debug mode is now {statusText}',
    shellInvalidOption: 'Invalid option. Use `/shell on` or `/shell off`',
    workspaceNotFoundForShell: 'I couldn\'t find that workspace.',
    responseFailed: 'I couldn\'t process that response.',
    helpCompact: `📚 *Commands*

*Basics*
/workspaces - Select workspace
/status - Current status
/newtask - Fresh start

*Tasks*
/cancel - Stop task
/approve or /yes - Approve action
/deny or /no - Reject action

*Settings*
/shell on|off - Shell access
/models - Change AI model

━━━━━━━━━━━━━━━
💡 Just send your task directly.
Example: "Add a login form"`,
    helpFull: `📚 *Commands*

*Core*
/start - Start
/help - Help
/status - Status
/version - Version

*Workspaces*
/workspaces - List workspaces
/workspace <name> - Select workspace
/addworkspace <path> - Add workspace
/removeworkspace <name> - Remove workspace

*Tasks*
/newtask - New task
/cancel - Cancel current task
/retry - Retry last failed task
/history - Recent tasks
/approve - Approve (or /yes, /y)
/deny - Deny (or /no, /n)
/queue - View/clear queue

*Models*
/providers - List providers
/provider <name> - Change provider
/models - List models
/model <name> - Change model

*Skills*
/skills - List skills
/skill <name> - Toggle skill

*Settings*
/settings - Current settings
/shell - Toggle shell access
/debug - Toggle debug mode

💬 *Quick Start*
1. \`/workspaces\` → \`/workspace <name>\`
2. \`/shell on\` if needed
3. Send your task
4. \`/newtask\` to reset`,
  },
};

/**
 * Message templates organized by personality type
 */
const CHANNEL_MESSAGES: Record<PersonalityId, Record<ChannelMessageKey, string>> = {
  professional: {
    taskComplete: 'Complete.',
    taskCompleteWithResult: 'Complete.\n\n{result}',
    taskFailed: 'Task failed: {error}',
    toolError: 'Tool error ({tool}): {error}',
    followUpProcessed: 'Follow-up processed.',
    followUpFailed: 'Follow-up failed: {error}',
    approvalNeeded: 'Approval required.',
  },
  friendly: {
    taskComplete: 'Done! Nice work.',
    taskCompleteWithResult: 'Done!\n\n{result}',
    taskFailed: 'Oops, something went wrong: {error}',
    toolError: 'Hit a snag with {tool}: {error}',
    followUpProcessed: 'Got it!',
    followUpFailed: 'That follow-up hit a bump: {error}',
    approvalNeeded: 'Need your OK on this!',
  },
  concise: {
    taskComplete: 'Done.',
    taskCompleteWithResult: 'Done.\n\n{result}',
    taskFailed: 'Failed: {error}',
    toolError: '{tool} error: {error}',
    followUpProcessed: 'Done.',
    followUpFailed: 'Failed: {error}',
    approvalNeeded: 'Approval?',
  },
  creative: {
    taskComplete: 'Masterpiece complete.',
    taskCompleteWithResult: 'Masterpiece complete.\n\n{result}',
    taskFailed: 'A twist in the tale: {error}',
    toolError: '{tool} encountered a plot twist: {error}',
    followUpProcessed: 'Another piece falls into place.',
    followUpFailed: 'The sequel hit a snag: {error}',
    approvalNeeded: 'Your vision is needed.',
  },
  technical: {
    taskComplete: 'Execution complete.',
    taskCompleteWithResult: 'Execution complete.\n\n{result}',
    taskFailed: 'Error: {error}',
    toolError: '{tool} exception: {error}',
    followUpProcessed: 'Follow-up executed.',
    followUpFailed: 'Follow-up exception: {error}',
    approvalNeeded: 'Awaiting user input.',
  },
  casual: {
    taskComplete: 'Nailed it.',
    taskCompleteWithResult: 'Nailed it.\n\n{result}',
    taskFailed: 'Uh oh: {error}',
    toolError: '{tool} had a moment: {error}',
    followUpProcessed: 'Check.',
    followUpFailed: 'That didn\'t work: {error}',
    approvalNeeded: 'Your call.',
  },
  custom: {
    taskComplete: 'Done.',
    taskCompleteWithResult: 'Done.\n\n{result}',
    taskFailed: 'Task failed: {error}',
    toolError: 'Tool error ({tool}): {error}',
    followUpProcessed: 'Follow-up complete.',
    followUpFailed: 'Follow-up failed: {error}',
    approvalNeeded: 'Approval needed.',
  },
};

const PERSONA_CHANNEL_MESSAGE_OVERRIDES: Partial<
  Record<PersonaId, Partial<Record<ChannelMessageKey, string>>>
> = {
  companion: {
    taskComplete: 'All set.',
    taskCompleteWithResult: 'All set.\n\n{result}',
    taskFailed: 'I hit a snag: {error}',
    toolError: 'I ran into an issue with {tool}: {error}',
    followUpProcessed: 'Got it. I\'m on it.',
    followUpFailed: 'I couldn\'t complete that: {error}',
    approvalNeeded: 'I need your OK on this.',
  },
};

/**
 * Emoji mappings for message types
 */
const EMOJI_MAP: Record<ChannelMessageKey, string> = {
  taskComplete: '✓',
  taskCompleteWithResult: '✓',
  taskFailed: '✗',
  toolError: '⚠',
  followUpProcessed: '✓',
  followUpFailed: '✗',
  approvalNeeded: '❓',
};

/**
 * Add emoji based on emojiUsage setting
 */
function addEmoji(message: string, key: ChannelMessageKey, emojiUsage: EmojiUsage): string {
  if (emojiUsage === 'none') return message;

  const emoji = EMOJI_MAP[key];
  if (!emoji) return message;

  // For minimal, only add checkmarks for success
  if (emojiUsage === 'minimal' && !['taskComplete', 'taskCompleteWithResult', 'followUpProcessed'].includes(key)) {
    return message;
  }

  return `${emoji} ${message}`;
}

/**
 * Get a personalized channel message
 */
export function getChannelMessage(
  key: ChannelMessageKey,
  ctx: ChannelMessageContext,
  replacements?: Record<string, string>
): string {
  const { personality, emojiUsage, persona } = ctx;

  // Get base message for personality
  const messages = CHANNEL_MESSAGES[personality] || CHANNEL_MESSAGES.professional;
  const personaOverride = persona
    ? PERSONA_CHANNEL_MESSAGE_OVERRIDES[persona]?.[key]
    : undefined;
  let message = personaOverride || messages[key] || CHANNEL_MESSAGES.professional[key] || key;

  // Replace placeholders
  if (replacements) {
    for (const [placeholder, value] of Object.entries(replacements)) {
      message = message.replace(`{${placeholder}}`, value);
    }
  }

  // Add emoji if appropriate
  message = addEmoji(message, key, emojiUsage);

  return message;
}

/**
 * Get channel UI copy with optional persona overrides
 */
export function getChannelUiCopy(
  key: ChannelUiKey,
  ctx: ChannelMessageContext,
  replacements?: Record<string, string | number>
): string {
  const base = CHANNEL_UI_COPY[key] || key;
  const override = ctx.persona
    ? PERSONA_CHANNEL_UI_OVERRIDES[ctx.persona]?.[key]
    : undefined;
  let message = override || base;

  if (replacements) {
    for (const [placeholder, value] of Object.entries(replacements)) {
      message = message.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), String(value));
    }
  }

  return message;
}

/**
 * Get completion message with optional result and follow-up hint
 * This is specific to channel messages which may include additional hints
 */
export function getCompletionMessage(
  ctx: ChannelMessageContext,
  result?: string,
  includeFollowUpHint = true
): string {
  const key: ChannelMessageKey = result ? 'taskCompleteWithResult' : 'taskComplete';
  let message = getChannelMessage(key, ctx, result ? { result } : undefined);

  // Add follow-up hint for channels that support it
  if (includeFollowUpHint && ctx.personality !== 'concise') {
    const companionHint = 'Send another message to continue, or use /newtask for a clean start.';
    const hints: Record<PersonalityId, string> = {
      professional: 'Send a follow-up message to continue, or use /newtask to start fresh.',
      friendly: 'Got more to do? Just send another message!',
      concise: '',
      creative: 'The story continues... send your next chapter!',
      technical: 'Ready for next command. Use /newtask for new context.',
      casual: 'What\'s next? Just hit me up.',
      custom: 'Send a follow-up message to continue.',
    };
    const hint = ctx.persona === 'companion' ? companionHint : hints[ctx.personality];
    if (hint) {
      message = `${message}\n\n${hint}`;
    }
  }

  return message;
}

/**
 * Default message context using professional personality
 */
export const DEFAULT_CHANNEL_CONTEXT: ChannelMessageContext = {
  agentName: 'CoWork',
  userName: undefined,
  personality: 'professional',
  persona: undefined,
  emojiUsage: 'minimal',
  quirks: {
    catchphrase: undefined,
    signOff: undefined,
    analogyDomain: 'none',
  },
};

export default getChannelMessage;
