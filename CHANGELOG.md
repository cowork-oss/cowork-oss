# Changelog

All notable changes to CoWork-OSS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CLI/ASCII terminal-style UI throughout the application
- Model selection dropdown (Opus 4.5, Sonnet 4.5, Haiku 4.5)
- AWS Bedrock support as alternative to Anthropic API

### Changed
- Updated branding to CoWork-OSS
- Improved workspace selector with terminal aesthetic

## [0.1.0] - 2025-01-24

### Added

#### Core Features
- Task-based workflow with multi-step execution
- Plan-execute-observe loop for agent orchestration
- Real-time task timeline with live activity feed
- Workspace management with folder selection

#### Agent Capabilities
- File operation tools (read, write, list, rename, delete)
- Built-in skills:
  - Spreadsheet creation (Excel format)
  - Document creation (Word/PDF)
  - Presentation creation (PowerPoint)
  - Folder organization

#### Security & Permissions
- Sandboxed file operations within selected workspace
- Permission system for destructive operations
- Approval dialogs for file deletion and bulk operations
- Path traversal protection

#### LLM Integration
- Anthropic Claude API support
- AWS Bedrock support
- Multiple model selection (Opus, Sonnet, Haiku)
- Settings UI for API configuration

#### User Interface
- Electron desktop application for macOS
- React-based UI with dark theme
- CLI/ASCII terminal aesthetic
- Task list with status indicators
- System monitor panel (progress, files, context)

#### Data Management
- SQLite local database
- Task and event persistence
- Workspace history
- Artifact tracking

### Technical
- Electron 40 with React 19
- TypeScript throughout
- Vite for fast development
- electron-builder for packaging

## [0.0.1] - 2025-01-20

### Added
- Initial project setup
- Basic Electron app shell
- Database schema design
- IPC communication layer

---

## Version History Summary

| Version | Date | Highlights |
|---------|------|------------|
| 0.1.0 | 2025-01-24 | First public release with core features |
| 0.0.1 | 2025-01-20 | Initial development setup |

[Unreleased]: https://github.com/mesutfelat/cowork-oss/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mesutfelat/cowork-oss/releases/tag/v0.1.0
[0.0.1]: https://github.com/mesutfelat/cowork-oss/releases/tag/v0.0.1
