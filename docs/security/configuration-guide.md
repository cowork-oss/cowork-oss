# Security Configuration Guide

This guide covers how to configure security settings in CoWork OS.

## Channel Security Modes

### Pairing Mode (Recommended)

Pairing mode requires users to enter a code to connect:

1. Go to **Settings > Channels > [Your Channel]**
2. Set **Security Mode** to "Pairing"
3. Click **Generate Pairing Code**
4. Share the 6-character code with the user
5. User sends the code as a message to pair

**Configuration:**
```
Security Mode: Pairing
Pairing Code TTL: 300 seconds (default)
Max Pairing Attempts: 5 (default)
```

### Allowlist Mode

Allowlist mode pre-approves specific users:

1. Go to **Settings > Channels > [Your Channel]**
2. Set **Security Mode** to "Allowlist"
3. Add user IDs to the **Allowed Users** list

**Finding User IDs:**
- Telegram: Use @userinfobot
- Discord: Enable Developer Mode, right-click user
- Slack: User profile > More > Copy member ID

### Open Mode (Use Carefully)

Open mode allows anyone to interact:

1. Go to **Settings > Channels > [Your Channel]**
2. Set **Security Mode** to "Open"

**When to use:**
- Private channels only you can access
- Testing environments
- Controlled internal deployments

## Context Policies

### Per-Context Security

Configure different settings for DMs vs groups:

1. Go to **Settings > Channels > [Your Channel] > Context Policies**
2. Select the **Direct Messages** or **Group Chats** tab
3. Configure:
   - Security mode per context
   - Tool restrictions per context

**Recommended Configuration:**

| Context | Security Mode | Tool Restrictions |
|---------|---------------|-------------------|
| DMs | Pairing | None |
| Groups | Pairing | Memory tools (clipboard) |

### Tool Restrictions

Restrict tool groups per context:

| Tool Group | Description | Default in Groups |
|------------|-------------|-------------------|
| Memory Tools | Clipboard read/write | Denied |
| System Tools | Screenshot, app launch | Allowed |
| Network Tools | Browser, web access | Allowed |
| Destructive Tools | Delete, shell commands | Allowed (with approval) |

## Workspace Permissions

### Basic Permissions

Configure per workspace in **Settings > Workspaces**:

| Permission | Description | Default |
|------------|-------------|---------|
| Read | Read files | Yes |
| Write | Create/modify files | Yes |
| Delete | Delete files | Yes (with approval) |
| Shell | Run shell commands | Yes (with approval) |
| Network | Browser/web access | Yes |

### Allowed Paths

Add paths outside workspace that tools can access:

1. Go to **Settings > Workspaces > [Your Workspace]**
2. Click **Add Allowed Path**
3. Enter the path (e.g., `/Users/me/shared`)

### Unrestricted Mode

Enable broader file access for development:

1. Go to **Settings > Workspaces > [Your Workspace]**
2. Toggle **Unrestricted File Access**

**Warning:** Only use in trusted environments.

## Sandbox Configuration

### Sandbox Type

Choose your sandbox implementation:

| Type | Platforms | Features |
|------|-----------|----------|
| Auto | All | Best available for platform |
| macOS | macOS only | Native sandbox-exec |
| Docker | All | Container isolation |
| None | All | No isolation (not recommended) |

### Docker Configuration

If using Docker sandbox:

```
Image: node:20-alpine (default)
CPU Limit: 1 core (default)
Memory Limit: 512m (default)
Network Mode: none (default) or bridge
```

**Prerequisites:**
- Docker must be installed and running
- User must have permission to create containers

## Guardrails

### Command Blocking

Built-in blocked patterns:
- `sudo` - Privilege escalation
- `rm -rf /` - Destructive deletions
- `curl | bash` - Remote code execution

Add custom blocked patterns:
1. Go to **Settings > Guardrails**
2. Add patterns to **Custom Blocked Patterns**

### Trusted Commands

Auto-approve safe commands:
1. Go to **Settings > Guardrails**
2. Enable **Auto-approve Trusted Commands**
3. Default includes: npm/yarn test, git status, ls, etc.

### Budget Limits

Set limits per task:
- **Max Tokens**: Limit API token usage
- **Max Cost**: Limit spending per task
- **Max Iterations**: Limit planning loops

## Rate Limiting

Rate limits are automatic and not configurable:

| Operation | Limit |
|-----------|-------|
| Expensive (LLM, search) | 10/minute |
| Standard | 60/minute |
| Settings changes | 5/minute |

## Audit Logging

All messages and actions are logged automatically:
- Location: `~/Library/Application Support/cowork-os/`
- Database: `cowork-os.db`
- Tables: `audit_log`, `channel_messages`

## Verification Checklist

After configuration, verify:

- [ ] Pairing mode enabled for external channels
- [ ] Context policies configured for groups
- [ ] Workspace permissions appropriate
- [ ] Guardrails configured
- [ ] Sandbox type selected
- [ ] Test with a pairing code
