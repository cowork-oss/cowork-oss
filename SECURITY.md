# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously at CoWork-OSS. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of the following methods:

1. **GitHub Security Advisories**: Use the "Report a vulnerability" button in the Security tab of the repository
2. **Email**: Send details to [INSERT SECURITY EMAIL]

### What to Include

Please include as much of the following information as possible:

- Type of vulnerability (e.g., code injection, path traversal, etc.)
- Full paths of affected source files
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact assessment of the vulnerability

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 5 business days
- **Resolution Target**: Within 30 days (depending on complexity)

### What to Expect

1. **Acknowledgment**: We'll confirm receipt of your report
2. **Assessment**: We'll investigate and determine the severity
3. **Updates**: We'll keep you informed of our progress
4. **Resolution**: We'll work on a fix and coordinate disclosure
5. **Credit**: We'll credit you in the security advisory (if desired)

## Security Considerations

### API Keys and Secrets

- **Never commit API keys** or secrets to the repository
- Store sensitive data in `.env` files (which are gitignored)
- Use environment variables for configuration
- The app stores API keys locally in the user's system

### File System Access

- All file operations are sandboxed to the selected workspace
- Path traversal attacks are prevented
- Destructive operations (delete, bulk rename) require user approval

### Network Security

- Network access requires explicit permission
- Future versions will include domain allowlisting
- All API calls use HTTPS

### Local Data Storage

- SQLite database is stored in user's Application Support folder
- No sensitive data is transmitted to external services (except configured LLM providers)
- Users control their own API keys

## Security Best Practices for Users

1. **Keep Updated**: Always use the latest version
2. **Protect API Keys**: Never share your `.env` file
3. **Review Permissions**: Be cautious when approving file operations
4. **Workspace Selection**: Only grant access to necessary folders
5. **Network Awareness**: Monitor any network permission requests

## Scope

This security policy applies to:
- The CoWork-OSS application code
- Build and distribution processes
- Documentation

Out of scope:
- Third-party dependencies (report to respective maintainers)
- User configuration issues
- Social engineering attacks

## Recognition

We appreciate security researchers who help keep CoWork-OSS safe. Contributors who report valid security issues will be:

- Credited in security advisories (with permission)
- Added to our security acknowledgments (if desired)

Thank you for helping keep CoWork-OSS and its users safe!
