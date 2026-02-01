# CoWork OS Security Documentation

This documentation covers the security architecture of CoWork OS, an AI-powered task automation platform.

## Contents

1. [Security Model](./security-model.md) - Overview of the security architecture
2. [Trust Boundaries](./trust-boundaries.md) - Understanding workspace, channel, and network boundaries
3. [Configuration Guide](./configuration-guide.md) - How to configure security settings
4. [Best Practices](./best-practices.md) - Recommended security settings and practices

## Quick Start

CoWork OS is designed with security in mind. By default:

- **Pairing mode** is enabled for all channels - users must enter a pairing code to connect
- **Sandboxing** isolates command execution using macOS sandbox-exec or Docker
- **Tool restrictions** prevent sensitive operations in shared contexts (group chats)
- **Approval gates** require user confirmation for destructive operations

## Security Principles

1. **Defense in Depth** - Multiple layers of security controls
2. **Least Privilege** - Tools only have access to what they need
3. **Deny by Default** - Explicit allowlisting for access
4. **Audit Trail** - All messages and actions are logged

## Need Help?

- For security questions, see the [FAQ section](./best-practices.md#faq)
- To report a security issue, please email security@cowork.dev
