# Getting Started with Cowork

## Quick Start (5 minutes)

### Step 1: Install Dependencies

```bash
cd /Users/user/Downloads/app/cowork
npm install
```

### Step 2: Set Up API Key

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Get your API key from: https://console.anthropic.com/

### Step 3: Run the App

```bash
npm run dev
```

This will:
1. Start the Vite dev server (React UI)
2. Launch Electron with hot reload enabled
3. Open DevTools automatically

### Step 4: Create Your First Task

1. **Select a Workspace**
   - Click "Select Folder"
   - Choose a folder you want Cowork to work in
   - This will be your workspace (e.g., `~/Documents/test-workspace`)

2. **Create a Task**
   - Click "+ New Task"
   - Title: "Organize my files"
   - Description: "Please organize all files in this folder by file type (Images, Documents, etc.)"
   - Click "Create Task"

3. **Watch it Work**
   - The agent will create a plan
   - Execute steps using file operation tools
   - Show real-time progress in the timeline
   - Request approval before making changes

## Example Tasks to Try

### 1. File Organization

```
Title: Organize Downloads
Description: Organize all files in this folder by type. Create folders for Images, Documents, Spreadsheets, and Other. Move files into appropriate folders.
```

### 2. Data Analysis

```
Title: Analyze CSV data
Description: Read all CSV files in this folder, combine them, and create a summary spreadsheet showing total records, date ranges, and key statistics.
```

### 3. Document Creation

```
Title: Create quarterly report
Description: Create a presentation with 5 slides covering Q1 2024 highlights. Include: Overview, Revenue, Growth, Challenges, and Next Steps. Use placeholder data.
```

### 4. Bulk Renaming

```
Title: Rename image files
Description: Rename all image files in this folder to follow the pattern: photo_YYYY-MM-DD_NNN.ext based on their creation date.
```

## Understanding the UI

### Sidebar (Left)

- **Workspace Info**: Shows current workspace name and path
- **New Task Button**: Create a new task
- **Task List**: All tasks sorted by creation date
- **Task Status Indicators**:
  - 🔵 Blue = Active (planning/executing)
  - 🟢 Green = Completed
  - 🔴 Red = Failed/Cancelled
  - ⚪ Gray = Pending

### Task View (Right)

- **Task Header**: Title and metadata
- **Task Description**: What you asked for
- **Activity Timeline**: Real-time execution log showing:
  - 🎯 Task created
  - 📋 Plan created
  - ▶️ Steps started
  - ✅ Steps completed
  - 🔧 Tool calls
  - 📄 Files created/modified
  - ❌ Errors

### Approval Dialogs

When the agent needs permission for:
- 🗑️ Deleting files
- 📝 Bulk operations
- 🌐 Network access

You'll see a dialog with:
- What it wants to do
- Why it needs to do it
- Approve or Deny buttons

## Development Workflow

### Making Changes

The app supports hot reload:

1. **React UI Changes**: Edit files in `src/renderer/` - auto-refreshes
2. **Electron Main Changes**: Edit files in `src/electron/` - auto-restarts
3. **Shared Types**: Edit `src/shared/types.ts` - both reload

### Project Structure

```
src/
├── electron/          # Backend (Node.js)
│   ├── main.ts       # App entry point
│   ├── agent/        # AI agent logic
│   └── database/     # SQLite storage
├── renderer/         # Frontend (React)
│   ├── App.tsx       # Main component
│   └── components/   # UI components
└── shared/           # Shared between both
    └── types.ts      # TypeScript types
```

### Debugging

**Renderer Process (UI)**:
- DevTools open automatically in dev mode
- Use `console.log()` - shows in DevTools Console
- React DevTools available

**Main Process (Backend)**:
- Use `console.log()` - shows in terminal
- Check logs: `~/Library/Application Support/cowork-app/`

### Database

SQLite database location: `~/Library/Application Support/cowork-app/cowork.db`

View it with any SQLite browser or:
```bash
sqlite3 ~/Library/Application\ Support/cowork-app/cowork.db
.tables
SELECT * FROM tasks;
```

## Building for Production

```bash
# Build both renderer and electron
npm run build

# Package as macOS app
npm run package
```

Output: `release/Cowork-0.1.0.dmg`

## Common Issues

### Issue: "ANTHROPIC_API_KEY not found"

**Solution**: Make sure `.env` file exists with your API key:
```bash
echo "ANTHROPIC_API_KEY=your_key" > .env
```

### Issue: Electron won't start

**Solution**: Clear and reinstall:
```bash
rm -rf node_modules dist
npm install
npm run dev
```

### Issue: "Permission denied" for workspace

**Solution**: Choose a folder you have write access to, like:
- `~/Documents/cowork-test`
- `~/Downloads/test`

Don't use system folders like `/System` or `/Applications`.

### Issue: Tasks fail immediately

**Solution**: Check:
1. Valid API key in `.env`
2. Workspace has proper permissions
3. Network connection for API calls
4. Check console for error messages

## Next Steps

### Try Advanced Features

1. **Skills**: Use built-in skills for document creation
2. **Multiple Tasks**: Queue several tasks at once
3. **Approvals**: Practice approving/denying operations

### Extend the App

1. Add new tools in `src/electron/agent/tools/`
2. Create custom skills in `src/electron/agent/skills/`
3. Customize UI in `src/renderer/components/`

### Learn More

- [Full README](README.md) - Complete documentation
- [Anthropic API Docs](https://docs.anthropic.com/) - Claude API reference
- [Electron Docs](https://www.electronjs.org/docs) - Electron framework

## Getting Help

- Check console output for errors
- Review the task timeline for clues
- Read error messages in the UI
- Check the SQLite database for stored data

## Tips for Best Results

1. **Be Specific**: Clear task descriptions work better
2. **Start Small**: Test with a few files before bulk operations
3. **Review Plans**: Check the execution plan before it runs
4. **Approve Carefully**: Read approval requests before accepting
5. **Monitor Progress**: Watch the timeline to understand what's happening

Happy automating! 🚀
