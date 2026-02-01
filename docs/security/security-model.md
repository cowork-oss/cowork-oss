# Security Model

CoWork OS implements a layered security model with multiple defense mechanisms.

## Architecture Overview

```
+------------------------------------------------------------------+
|                        User Interface                             |
+------------------------------------------------------------------+
|                    Channel Security Layer                         |
|  [Pairing Mode] [Allowlist Mode] [Open Mode]                     |
|  [Context Policies: DM vs Group]                                  |
+------------------------------------------------------------------+
|                    Policy Manager Layer                           |
|  [4-Layer Monotonic Deny-Wins System]                            |
|  [Tool Groups] [Blocked Patterns] [Approval Gates]               |
+------------------------------------------------------------------+
|                    Sandbox Layer                                  |
|  [macOS sandbox-exec] [Docker Containers] [Process Isolation]    |
+------------------------------------------------------------------+
|                    Filesystem Layer                               |
|  [Workspace Boundaries] [Protected Paths] [Allowed Paths]        |
+------------------------------------------------------------------+
```

## Channel Security

### Security Modes

CoWork OS supports three security modes for external channels (Telegram, Discord, etc.):

| Mode | Description | Use Case |
|------|-------------|----------|
| **Pairing** | Users must enter a 6-character code | Recommended for most cases |
| **Allowlist** | Only pre-approved user IDs allowed | Enterprise deployments |
| **Open** | Anyone can interact | Trusted private channels only |

### Context Policies

Different security settings can apply to DMs vs group chats:

- **DM (Direct Messages)**: Full capability by default
- **Group Chats**: Memory tools (clipboard) restricted by default

This mirrors the approach used by similar tools like OpenClaw, treating group messages as higher risk than direct messages.

## Policy Manager

The policy manager implements a **monotonic deny-wins** system with four layers:

### Layer 1: Global Guardrails

Dangerous patterns that are always blocked:
- `sudo` - Privilege escalation
- `rm -rf /` - Destructive deletions
- `curl | bash` - Remote code execution
- Fork bombs, disk formatting commands

### Layer 2: Workspace Permissions

Per-workspace controls:
- **Read**: Allow reading files
- **Write**: Allow creating/modifying files
- **Delete**: Allow file deletion
- **Shell**: Allow command execution
- **Network**: Allow web/browser access

### Layer 3: Context Restrictions

Based on message context (private/group/public):
- Memory tools denied in group contexts
- Clipboard access denied in shared contexts

### Layer 4: Tool-Specific Rules

Individual tool permissions and approval gates:
- Destructive tools require user approval
- Shell commands always require approval

## Sandboxing

### macOS (Primary)

Uses native `sandbox-exec` with generated profiles:
- Deny-by-default policy
- Explicit allows for workspace and system paths
- Network isolation (localhost only by default)
- Mach service restrictions

### Docker (Cross-platform)

For Linux and Windows systems:
- Container isolation per command
- Volume mounts for workspace access
- CPU and memory limits
- Network mode: none (default) or bridge
- Read-only root filesystem

### Fallback

When sandboxing unavailable:
- Process isolation with timeout
- Output size limits
- Environment variable filtering

## Filesystem Protection

### Protected Paths

These paths can never be written to:
- `/System`, `/Library`, `/usr`, `/bin` (macOS)
- `C:\Windows`, `C:\Program Files` (Windows)

### Workspace Boundaries

By default, tools can only access:
1. The active workspace directory
2. Explicitly allowed paths in settings
3. Temporary directories

### Path Traversal Prevention

Multiple validation layers prevent `../` escape:
- Path normalization
- Relative path detection
- Workspace prefix checking

## Rate Limiting

| Operation | Limit |
|-----------|-------|
| LLM calls | 10/minute |
| Task creation | 10/minute |
| Settings changes | 5/minute |
| Standard operations | 60/minute |

## Brute-Force Protection

For pairing codes:
- Maximum 5 attempts
- 15-minute lockout after max attempts
- Automatic cleanup of expired codes

## Concurrency Safety

### Mutex Locks
- Pairing operations protected by named mutexes
- Prevents race conditions in verification

### Idempotency
- Approval operations tracked with idempotency keys
- Prevents double-processing of the same request
