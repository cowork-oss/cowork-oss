# Cowork - Agentic Task Automation for macOS

A desktop application inspired by Claude Cowork that provides agentic task automation with high agency over local folders.

## Features

### Core Capabilities

- **Task-Based Workflow**: Multi-step task execution with plan-execute-observe loops
- **Workspace Management**: Sandboxed file operations within selected folders
- **Permission System**: Explicit approval for destructive operations (delete, bulk rename)
- **Skill System**: Built-in skills for creating professional outputs:
  - Spreadsheet creation (Excel format)
  - Document creation (Word/PDF)
  - Presentation creation (PowerPoint)
  - Folder organization
- **Real-Time Timeline**: Live activity feed showing agent actions and tool calls
- **Artifact Tracking**: All created/modified files are tracked and viewable

### Architecture

```
┌─────────────────────────────────────────────────┐
│              React UI (Renderer)                 │
│  - Task List                                     │
│  - Task Timeline                                 │
│  - Approval Dialogs                              │
│  - Workspace Selector                            │
└─────────────────────────────────────────────────┘
                      ↕ IPC
┌─────────────────────────────────────────────────┐
│            Agent Daemon (Main Process)           │
│  - Task Orchestration                            │
│  - Agent Executor (Plan-Execute Loop)            │
│  - Tool Registry                                 │
│  - Permission Manager                            │
└─────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────┐
│                  Execution Layer                 │
│  - File Operations                               │
│  - Skills (Document Creation)                    │
│  - Sandbox Runner (VM - TODO)                    │
└─────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────┐
│              SQLite Local Database               │
│  - Tasks, Events, Artifacts, Workspaces          │
└─────────────────────────────────────────────────┘
```

## Setup

### Prerequisites

- Node.js 18+ and npm
- macOS (for Electron native features)
- Anthropic API key

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
# Create .env file in project root
echo "ANTHROPIC_API_KEY=your_api_key_here" > .env
```

3. Run in development mode:
```bash
npm run dev
```

This will start:
- Vite dev server for React UI (port 5173)
- Electron app with hot reload

### Building for Production

```bash
npm run build
npm run package
```

The packaged app will be in the `release/` directory.

## Usage

### 1. Select a Workspace

On first launch, select a folder where Cowork can work. This folder will be:
- Mounted for read/write access
- Protected by permission boundaries
- Used as the working directory for all tasks

### 2. Create a Task

Click "New Task" and describe what you want to accomplish:

**Example Tasks:**
- "Organize my Downloads folder by file type"
- "Create a quarterly report spreadsheet with Q1-Q4 data"
- "Generate a presentation about our product roadmap"
- "Analyze these CSV files and create a summary document"

### 3. Monitor Execution

Watch the task timeline as the agent:
- Creates an execution plan
- Executes steps using available tools
- Requests approvals for destructive operations
- Produces artifacts (files)

### 4. Approve Requests

When the agent needs to perform destructive actions:
- Delete files
- Bulk rename operations
- External network access

You'll see an approval dialog. Review the details and approve or deny.

## Project Structure

```
cowork/
├── src/
│   ├── electron/               # Main process (Node.js)
│   │   ├── main.ts            # Electron entry point
│   │   ├── preload.ts         # IPC bridge
│   │   ├── database/          # SQLite schema & repositories
│   │   ├── agent/             # Agent orchestration
│   │   │   ├── daemon.ts      # Task coordinator
│   │   │   ├── executor.ts    # Agent execution loop
│   │   │   ├── tools/         # Tool implementations
│   │   │   ├── skills/        # Document creation skills
│   │   │   └── sandbox/       # VM sandbox (TODO)
│   │   └── ipc/               # IPC handlers
│   ├── renderer/              # React UI
│   │   ├── App.tsx            # Main app component
│   │   ├── components/        # UI components
│   │   └── styles/            # CSS styles
│   └── shared/                # Shared types
│       └── types.ts           # TypeScript definitions
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Electron 28 + Node.js
- **Database**: better-sqlite3 (embedded SQLite)
- **AI**: Anthropic Claude API (Sonnet 4)
- **Build**: electron-builder

## Implementation Status

### ✅ Completed (MVP 1 & 2)

- [x] Project setup and build configuration
- [x] Electron app shell with React UI
- [x] SQLite database with repositories
- [x] IPC communication layer
- [x] Agent daemon and task orchestration
- [x] Task executor with plan-execute-observe loop
- [x] File operation tools (read, write, list, rename, delete)
- [x] Basic skills (spreadsheet, document, presentation, organizer)
- [x] Task-based UI (not chat UI)
- [x] Task timeline with real-time events
- [x] Workspace selector
- [x] Approval system with UI dialogs
- [x] Permission boundaries

### 🚧 In Progress

- [ ] VM sandbox using macOS Virtualization.framework
- [ ] MCP connector host and registry
- [ ] Sub-agent coordination for parallel tasks
- [ ] Enhanced document creation (proper Excel/Word/PowerPoint libraries)

### 📋 Planned (Future MVPs)

- [ ] Network egress controls with proxy
- [ ] Browser automation (Playwright or Chrome extension)
- [ ] Skill marketplace/loader
- [ ] Multi-workspace support
- [ ] Task templates
- [ ] Export/import tasks
- [ ] Cloud sync (optional)

## Security & Permissions

### Workspace Boundaries

All file operations are constrained to the selected workspace folder. Path traversal attempts are rejected.

### Permission Model

```typescript
interface WorkspacePermissions {
  read: boolean;      // Read files
  write: boolean;     // Create/modify files
  delete: boolean;    // Delete files (requires approval)
  network: boolean;   // Network access (future)
  allowedDomains?: string[];  // Network allowlist (future)
}
```

### Approval Requirements

The following operations always require user approval:
- File deletion
- Bulk rename (>10 files)
- Network access beyond allowlist
- External service calls

## Configuration

### Environment Variables

- `ANTHROPIC_API_KEY` - Your Anthropic API key (required)
- `NODE_ENV` - Set to 'development' for dev mode

### User Data Location

- macOS: `~/Library/Application Support/cowork-app/`
  - `cowork.db` - SQLite database
  - Logs and preferences

## Development

### Hot Reload

Development mode provides hot reload for both:
- React UI (Vite HMR)
- Electron main process (auto-restart on changes)

### Debugging

- Open DevTools: Automatic in development mode
- View logs: Check console in DevTools
- Database: Use SQLite viewer on `cowork.db`

### Adding New Tools

1. Define tool schema in [tools/registry.ts](src/electron/agent/tools/registry.ts)
2. Implement tool logic in [tools/file-tools.ts](src/electron/agent/tools/file-tools.ts) or create new file
3. Register tool in `getTools()` method
4. Add execution handler in `executeTool()`

### Adding New Skills

1. Create skill implementation in [skills/](src/electron/agent/skills/) directory
2. Add skill tool definition in [tools/skill-tools.ts](src/electron/agent/tools/skill-tools.ts)
3. Implement the skill method in SkillTools class

## Comparison to Claude Cowork

This implementation aims for "close parity" with Claude Cowork's core features:

| Feature | Claude Cowork | This Implementation |
|---------|---------------|---------------------|
| Task-based workflow | ✅ | ✅ |
| Multi-step execution | ✅ | ✅ |
| File operations | ✅ | ✅ |
| Document creation | ✅ | ✅ (basic) |
| Approval system | ✅ | ✅ |
| VM sandbox | ✅ | ⏳ (planned) |
| MCP connectors | ✅ | ⏳ (planned) |
| Sub-agents | ✅ | ⏳ (planned) |
| Browser automation | ✅ | ⏳ (planned) |
| Network controls | ✅ | ⏳ (planned) |

## Troubleshooting

### "ANTHROPIC_API_KEY not found"

Set the environment variable before running:
```bash
export ANTHROPIC_API_KEY=your_key_here
npm run dev
```

### Electron won't start

Clear cache and rebuild:
```bash
rm -rf node_modules dist
npm install
npm run dev
```

### Database locked

Close all instances of the app and delete the lock file:
```bash
rm ~/Library/Application\ Support/cowork-app/cowork.db-journal
```

## Contributing

This is an educational implementation inspired by Claude Cowork. Contributions are welcome!

Areas where help is needed:
- VM sandbox implementation using Virtualization.framework
- MCP protocol integration
- Enhanced document creation libraries
- Network security controls
- Sub-agent coordination

## License

MIT

## Acknowledgments

- Inspired by [Claude Cowork](https://claude.com/blog/cowork-research-preview) by Anthropic
- Built on [Anthropic Claude API](https://www.anthropic.com/api)
- Architecture references from [Claude Code](https://docs.anthropic.com/claude/docs/claude-code)

## Disclaimer

This is an independent implementation inspired by Claude Cowork. It is not affiliated with, endorsed by, or officially connected to Anthropic PBC.
