# Trust Boundaries

Understanding the security boundaries in CoWork OS helps you configure appropriate access controls.

## Workspace Boundary

```
+------------------------------------------+
|              Workspace                    |
|  +------------------------------------+  |
|  |     Files & Directories            |  |
|  |  - Source code                     |  |
|  |  - Configuration                   |  |
|  |  - Generated artifacts             |  |
|  +------------------------------------+  |
|                                          |
|  Permissions:                            |
|  - read, write, delete                   |
|  - shell (command execution)             |
|  - network (browser/web access)          |
+------------------------------------------+
         |
         | Allowed Paths (optional)
         v
+------------------------------------------+
|           External Paths                  |
|  - ~/Documents (if configured)           |
|  - /shared/projects (if configured)      |
+------------------------------------------+
```

### Workspace Isolation

Each workspace operates in isolation:
- Tools can only access files within the workspace by default
- External paths require explicit configuration
- Different workspaces cannot access each other's files

### Unrestricted Mode

When `unrestrictedFileAccess` is enabled:
- Tools can read/write files anywhere the user has permission
- Protected system paths are still blocked
- Use only for development workflows requiring broad access

## Channel Boundary

```
+------------------------------------------+
|           External Channel                |
|  (Telegram, Discord, Slack, etc.)        |
+------------------------------------------+
         |
         | Security Mode
         v
+------------------------------------------+
|         Security Layer                    |
|  - Pairing code verification             |
|  - Allowlist checking                    |
|  - User authentication                   |
+------------------------------------------+
         |
         | Context Policy
         v
+------------------------------------------+
|         Context Restrictions              |
|  DM: Full access                          |
|  Group: Memory tools blocked              |
+------------------------------------------+
         |
         v
+------------------------------------------+
|         CoWork OS Processing              |
+------------------------------------------+
```

### Channel Trust Levels

| Level | How Users Get It | Capabilities |
|-------|------------------|--------------|
| Untrusted | Default for unknown users | Access denied |
| Paired | Entered valid pairing code | Full context access |
| Allowlisted | Pre-configured in settings | Full context access |
| Open Mode | Any user | Full context access |

### Context-Based Restrictions

Even after authentication, capabilities vary by context:

**DM Context:**
- Full tool access
- No memory restrictions
- Clipboard read/write allowed

**Group Context:**
- Memory tools blocked (clipboard)
- Prevents data leakage to other group members
- Other tools function normally

## Network Boundary

```
+------------------------------------------+
|           CoWork OS                       |
+------------------------------------------+
         |
         | Network Permission
         v
+------------------------------------------+
|         Browser / Web Tools               |
|  - browser_navigate                       |
|  - browser_get_content                    |
|  - web_search                             |
+------------------------------------------+
         |
         | Domain Allowlist (optional)
         v
+------------------------------------------+
|           External Networks               |
|  - Internet (if network=true)            |
|  - Localhost only (if network=false)     |
+------------------------------------------+
```

### Network Controls

**Workspace Level:**
- `network: true` enables browser/web tools
- `network: false` blocks all external network access

**Guardrail Level:**
- `enforceAllowedDomains: true` limits to specific domains
- Domain allowlist restricts which sites can be accessed

**Sandbox Level:**
- Docker: `--network none` by default
- macOS: localhost only unless explicitly allowed

## Tool Boundary

```
+------------------------------------------+
|           Tool Execution                  |
+------------------------------------------+
         |
         | Risk Level Check
         v
+------------------------------------------+
|         Policy Manager                    |
|  - Is tool allowed?                       |
|  - Requires approval?                     |
|  - Blocked by guardrails?                 |
+------------------------------------------+
         |
         | Approval Gate (if needed)
         v
+------------------------------------------+
|         User Approval                     |
|  - Review tool call                       |
|  - Approve or deny                        |
+------------------------------------------+
         |
         v
+------------------------------------------+
|         Sandboxed Execution               |
+------------------------------------------+
```

### Tool Risk Levels

| Risk Level | Examples | Behavior |
|------------|----------|----------|
| Read | read_file, list_directory | Auto-allowed if read permission |
| Write | write_file, create_directory | Auto-allowed if write permission |
| Destructive | delete_file, run_command | Always requires approval |
| System | screenshot, clipboard | Context-dependent |
| Network | browser_navigate | Requires network permission |

### Approval Gates

Some operations always require user approval:
- Shell command execution
- File deletion
- Destructive operations

The approval shows:
- Tool name and description
- Parameters being used
- Allows user to approve or deny

## Trust Hierarchy

```
Most Trusted
    |
    +-- Local Desktop UI
    |     - Direct user interaction
    |     - Full approval capability
    |
    +-- Private DM (Paired)
    |     - Authenticated user
    |     - Full tool access
    |
    +-- Group Chat (Paired)
    |     - Authenticated user
    |     - Memory tools restricted
    |
    +-- Open Mode
    |     - Any user
    |     - Same as paired access
    |
    +-- Unknown User
          - No access
          - Must pair first
Least Trusted
```
