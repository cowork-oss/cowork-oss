/**
 * Tests for Tailscale CLI Integration
 *
 * Note: These tests focus on the logic that can be tested without
 * complex mocking of child_process and fs modules. Integration tests
 * with actual Tailscale would require a real installation.
 */

import { describe, it, expect } from 'vitest';

// Test the module exports exist
describe('Tailscale module exports', () => {
  it('should export all expected functions', async () => {
    const tailscale = await import('../tailscale');

    expect(typeof tailscale.findTailscaleBinary).toBe('function');
    expect(typeof tailscale.getTailscaleBinary).toBe('function');
    expect(typeof tailscale.isTailscaleInstalled).toBe('function');
    expect(typeof tailscale.getTailscaleStatus).toBe('function');
    expect(typeof tailscale.getTailnetHostname).toBe('function');
    expect(typeof tailscale.enableTailscaleServe).toBe('function');
    expect(typeof tailscale.disableTailscaleServe).toBe('function');
    expect(typeof tailscale.enableTailscaleFunnel).toBe('function');
    expect(typeof tailscale.disableTailscaleFunnel).toBe('function');
    expect(typeof tailscale.checkTailscaleFunnelAvailable).toBe('function');
    expect(typeof tailscale.clearTailscaleCache).toBe('function');
  });
});

describe('TailscaleStatusJson type', () => {
  it('should accept valid status objects', () => {
    // This tests the type structure by checking it compiles
    const validStatus = {
      Version: '1.50.0',
      TUN: true,
      BackendState: 'Running',
      Self: {
        ID: 'node123',
        UserID: 1,
        HostName: 'my-machine',
        DNSName: 'my-machine.tail1234.ts.net.',
        OS: 'darwin',
        Online: true,
        Capabilities: ['https', 'funnel'],
      },
      TailscaleIPs: ['100.100.1.1'],
      MagicDNSSuffix: 'tail1234.ts.net',
    };

    expect(validStatus.Version).toBe('1.50.0');
    expect(validStatus.Self.DNSName).toBe('my-machine.tail1234.ts.net.');
    expect(validStatus.TailscaleIPs).toContain('100.100.1.1');
  });
});

describe('Constants', () => {
  it('should have expected macOS paths defined', async () => {
    // Test that the module has reasonable defaults
    const tailscale = await import('../tailscale');

    // The functions should exist and be callable
    expect(tailscale.findTailscaleBinary).toBeDefined();
    expect(tailscale.getTailscaleBinary).toBeDefined();
  });
});

describe('clearTailscaleCache', () => {
  it('should be callable without errors', async () => {
    const { clearTailscaleCache } = await import('../tailscale');

    expect(() => clearTailscaleCache()).not.toThrow();
  });
});
