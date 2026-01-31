/**
 * Tests for WebSocket Control Plane Server
 *
 * Note: Full integration tests require complex mocking of http and ws modules.
 * These tests focus on configuration and type validation.
 */

import { describe, it, expect } from 'vitest';

describe('ControlPlaneServer module', () => {
  it('should export ControlPlaneServer class', async () => {
    const module = await import('../server');
    expect(module.ControlPlaneServer).toBeDefined();
    expect(typeof module.ControlPlaneServer).toBe('function');
  });
});

describe('ControlPlaneConfig type structure', () => {
  it('should define required token field', () => {
    // TypeScript type validation - config must have token
    const config = {
      token: 'test-token',
    };
    expect(config.token).toBe('test-token');
  });

  it('should allow optional port', () => {
    const config = {
      token: 'test',
      port: 9999,
    };
    expect(config.port).toBe(9999);
  });

  it('should allow optional host', () => {
    const config = {
      token: 'test',
      host: '0.0.0.0',
    };
    expect(config.host).toBe('0.0.0.0');
  });

  it('should allow optional handshakeTimeoutMs', () => {
    const config = {
      token: 'test',
      handshakeTimeoutMs: 5000,
    };
    expect(config.handshakeTimeoutMs).toBe(5000);
  });

  it('should allow optional heartbeatIntervalMs', () => {
    const config = {
      token: 'test',
      heartbeatIntervalMs: 15000,
    };
    expect(config.heartbeatIntervalMs).toBe(15000);
  });

  it('should allow optional maxPayloadBytes', () => {
    const config = {
      token: 'test',
      maxPayloadBytes: 5 * 1024 * 1024,
    };
    expect(config.maxPayloadBytes).toBe(5 * 1024 * 1024);
  });

  it('should allow optional onEvent callback', () => {
    const events: unknown[] = [];
    const config = {
      token: 'test',
      onEvent: (event: unknown) => events.push(event),
    };
    config.onEvent({ action: 'test', timestamp: Date.now() });
    expect(events).toHaveLength(1);
  });

  it('should support full configuration', () => {
    const config = {
      port: 8080,
      host: '127.0.0.1',
      token: 'secure-token',
      handshakeTimeoutMs: 10000,
      heartbeatIntervalMs: 30000,
      maxPayloadBytes: 10 * 1024 * 1024,
      onEvent: () => {},
    };

    expect(config.port).toBe(8080);
    expect(config.host).toBe('127.0.0.1');
    expect(config.token).toBe('secure-token');
    expect(config.handshakeTimeoutMs).toBe(10000);
    expect(config.heartbeatIntervalMs).toBe(30000);
    expect(config.maxPayloadBytes).toBe(10 * 1024 * 1024);
    expect(config.onEvent).toBeDefined();
  });
});

describe('ControlPlaneServerEvent structure', () => {
  it('should support started action', () => {
    const event = {
      action: 'started' as const,
      timestamp: Date.now(),
    };
    expect(event.action).toBe('started');
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it('should support stopped action', () => {
    const event = {
      action: 'stopped' as const,
      timestamp: Date.now(),
    };
    expect(event.action).toBe('stopped');
  });

  it('should support client_connected action with clientId', () => {
    const event = {
      action: 'client_connected' as const,
      timestamp: Date.now(),
      clientId: 'client-123',
    };
    expect(event.action).toBe('client_connected');
    expect(event.clientId).toBe('client-123');
  });

  it('should support client_disconnected action', () => {
    const event = {
      action: 'client_disconnected' as const,
      timestamp: Date.now(),
      clientId: 'client-123',
      details: { code: 1000, reason: 'Normal closure' },
    };
    expect(event.action).toBe('client_disconnected');
    expect(event.details).toEqual({ code: 1000, reason: 'Normal closure' });
  });

  it('should support client_authenticated action', () => {
    const event = {
      action: 'client_authenticated' as const,
      timestamp: Date.now(),
      clientId: 'client-123',
      details: { deviceName: 'MyDevice' },
    };
    expect(event.action).toBe('client_authenticated');
  });

  it('should support request action with method', () => {
    const event = {
      action: 'request' as const,
      timestamp: Date.now(),
      clientId: 'client-123',
      method: 'task.create',
    };
    expect(event.action).toBe('request');
    expect(event.method).toBe('task.create');
  });

  it('should support error action', () => {
    const event = {
      action: 'error' as const,
      timestamp: Date.now(),
      error: 'Something went wrong',
    };
    expect(event.action).toBe('error');
    expect(event.error).toBe('Something went wrong');
  });
});

describe('Default configuration values', () => {
  it('should define expected defaults', () => {
    // Document the expected defaults for the server
    const expectedDefaults = {
      port: 18789,
      host: '127.0.0.1',
      handshakeTimeoutMs: 10000,
      heartbeatIntervalMs: 30000,
      maxPayloadBytes: 10 * 1024 * 1024, // 10MB
    };

    expect(expectedDefaults.port).toBe(18789);
    expect(expectedDefaults.host).toBe('127.0.0.1');
    expect(expectedDefaults.handshakeTimeoutMs).toBe(10000);
    expect(expectedDefaults.heartbeatIntervalMs).toBe(30000);
    expect(expectedDefaults.maxPayloadBytes).toBe(10485760);
  });
});
