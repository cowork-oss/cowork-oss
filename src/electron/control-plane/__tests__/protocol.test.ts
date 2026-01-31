/**
 * Tests for WebSocket Control Plane Protocol
 */

import { describe, it, expect } from 'vitest';
import {
  FrameType,
  parseFrame,
  serializeFrame,
  createRequestFrame,
  createResponseFrame,
  createErrorResponse,
  createEventFrame,
  ErrorCodes,
  Events,
  Methods,
} from '../protocol';

describe('FrameType', () => {
  it('should have correct values', () => {
    expect(FrameType.Request).toBe('req');
    expect(FrameType.Response).toBe('res');
    expect(FrameType.Event).toBe('event');
  });
});

describe('parseFrame', () => {
  describe('request frames', () => {
    it('should parse a valid request frame', () => {
      const json = JSON.stringify({
        type: 'req',
        id: 'test-123',
        method: 'ping',
        params: { foo: 'bar' },
      });

      const frame = parseFrame(json);

      expect(frame).not.toBeNull();
      expect(frame?.type).toBe('req');
      if (frame?.type === 'req') {
        expect(frame.id).toBe('test-123');
        expect(frame.method).toBe('ping');
        expect(frame.params).toEqual({ foo: 'bar' });
      }
    });

    it('should parse request frame without params', () => {
      const json = JSON.stringify({
        type: 'req',
        id: 'test-123',
        method: 'ping',
      });

      const frame = parseFrame(json);

      expect(frame).not.toBeNull();
      expect(frame?.type).toBe('req');
    });

    it('should reject request frame with empty id', () => {
      const json = JSON.stringify({
        type: 'req',
        id: '',
        method: 'ping',
      });

      const frame = parseFrame(json);
      expect(frame).toBeNull();
    });

    it('should reject request frame with empty method', () => {
      const json = JSON.stringify({
        type: 'req',
        id: 'test-123',
        method: '',
      });

      const frame = parseFrame(json);
      expect(frame).toBeNull();
    });

    it('should reject request frame with missing id', () => {
      const json = JSON.stringify({
        type: 'req',
        method: 'ping',
      });

      const frame = parseFrame(json);
      expect(frame).toBeNull();
    });
  });

  describe('response frames', () => {
    it('should parse a success response frame', () => {
      const json = JSON.stringify({
        type: 'res',
        id: 'test-123',
        ok: true,
        payload: { result: 'success' },
      });

      const frame = parseFrame(json);

      expect(frame).not.toBeNull();
      expect(frame?.type).toBe('res');
      if (frame?.type === 'res') {
        expect(frame.id).toBe('test-123');
        expect(frame.ok).toBe(true);
        expect(frame.payload).toEqual({ result: 'success' });
      }
    });

    it('should parse an error response frame', () => {
      const json = JSON.stringify({
        type: 'res',
        id: 'test-123',
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid token',
        },
      });

      const frame = parseFrame(json);

      expect(frame).not.toBeNull();
      expect(frame?.type).toBe('res');
      if (frame?.type === 'res') {
        expect(frame.ok).toBe(false);
        expect(frame.error?.code).toBe('UNAUTHORIZED');
      }
    });

    it('should reject response frame with non-boolean ok', () => {
      const json = JSON.stringify({
        type: 'res',
        id: 'test-123',
        ok: 'true',
      });

      const frame = parseFrame(json);
      expect(frame).toBeNull();
    });
  });

  describe('event frames', () => {
    it('should parse a valid event frame', () => {
      const json = JSON.stringify({
        type: 'event',
        event: 'heartbeat',
        payload: { timestamp: 123456 },
        seq: 1,
      });

      const frame = parseFrame(json);

      expect(frame).not.toBeNull();
      expect(frame?.type).toBe('event');
      if (frame?.type === 'event') {
        expect(frame.event).toBe('heartbeat');
        expect(frame.payload).toEqual({ timestamp: 123456 });
        expect(frame.seq).toBe(1);
      }
    });

    it('should parse event frame without payload', () => {
      const json = JSON.stringify({
        type: 'event',
        event: 'shutdown',
      });

      const frame = parseFrame(json);

      expect(frame).not.toBeNull();
      expect(frame?.type).toBe('event');
    });

    it('should reject event frame with empty event name', () => {
      const json = JSON.stringify({
        type: 'event',
        event: '',
      });

      const frame = parseFrame(json);
      expect(frame).toBeNull();
    });
  });

  describe('invalid frames', () => {
    it('should return null for invalid JSON', () => {
      const frame = parseFrame('not valid json');
      expect(frame).toBeNull();
    });

    it('should return null for non-object', () => {
      const frame = parseFrame('"string"');
      expect(frame).toBeNull();
    });

    it('should return null for null', () => {
      const frame = parseFrame('null');
      expect(frame).toBeNull();
    });

    it('should return null for unknown type', () => {
      const json = JSON.stringify({
        type: 'unknown',
        id: 'test',
      });

      const frame = parseFrame(json);
      expect(frame).toBeNull();
    });
  });
});

describe('serializeFrame', () => {
  it('should serialize request frame', () => {
    const frame = {
      type: 'req' as const,
      id: 'test-123',
      method: 'ping',
      params: { foo: 'bar' },
    };

    const json = serializeFrame(frame);
    const parsed = JSON.parse(json);

    expect(parsed.type).toBe('req');
    expect(parsed.id).toBe('test-123');
    expect(parsed.method).toBe('ping');
    expect(parsed.params).toEqual({ foo: 'bar' });
  });

  it('should serialize response frame', () => {
    const frame = {
      type: 'res' as const,
      id: 'test-123',
      ok: true,
      payload: { result: 'success' },
    };

    const json = serializeFrame(frame);
    const parsed = JSON.parse(json);

    expect(parsed.type).toBe('res');
    expect(parsed.ok).toBe(true);
  });

  it('should serialize event frame', () => {
    const frame = {
      type: 'event' as const,
      event: 'heartbeat',
      payload: { ts: 123 },
      seq: 5,
    };

    const json = serializeFrame(frame);
    const parsed = JSON.parse(json);

    expect(parsed.type).toBe('event');
    expect(parsed.event).toBe('heartbeat');
    expect(parsed.seq).toBe(5);
  });
});

describe('createRequestFrame', () => {
  it('should create a request frame with method and params', () => {
    const frame = createRequestFrame('task.create', { prompt: 'test' });

    expect(frame.type).toBe('req');
    expect(frame.method).toBe('task.create');
    expect(frame.params).toEqual({ prompt: 'test' });
    expect(frame.id).toBeDefined();
    expect(frame.id.length).toBeGreaterThan(0);
  });

  it('should create a request frame without params', () => {
    const frame = createRequestFrame('ping');

    expect(frame.type).toBe('req');
    expect(frame.method).toBe('ping');
    expect(frame.params).toBeUndefined();
  });

  it('should generate unique ids', () => {
    const frame1 = createRequestFrame('ping');
    const frame2 = createRequestFrame('ping');

    expect(frame1.id).not.toBe(frame2.id);
  });
});

describe('createResponseFrame', () => {
  it('should create a success response frame', () => {
    const frame = createResponseFrame('req-123', { success: true });

    expect(frame.type).toBe('res');
    expect(frame.id).toBe('req-123');
    expect(frame.ok).toBe(true);
    expect(frame.payload).toEqual({ success: true });
    expect(frame.error).toBeUndefined();
  });

  it('should create a response frame without payload', () => {
    const frame = createResponseFrame('req-123');

    expect(frame.ok).toBe(true);
    expect(frame.payload).toBeUndefined();
  });
});

describe('createErrorResponse', () => {
  it('should create an error response frame', () => {
    const frame = createErrorResponse(
      'req-123',
      ErrorCodes.UNAUTHORIZED,
      'Invalid token'
    );

    expect(frame.type).toBe('res');
    expect(frame.id).toBe('req-123');
    expect(frame.ok).toBe(false);
    expect(frame.error?.code).toBe('UNAUTHORIZED');
    expect(frame.error?.message).toBe('Invalid token');
  });

  it('should include details if provided', () => {
    const frame = createErrorResponse(
      'req-123',
      ErrorCodes.INVALID_PARAMS,
      'Missing required field',
      { field: 'prompt' }
    );

    expect(frame.error?.details).toEqual({ field: 'prompt' });
  });
});

describe('createEventFrame', () => {
  it('should create an event frame with all fields', () => {
    const frame = createEventFrame('task.completed', { taskId: '123' }, 5, 'v1');

    expect(frame.type).toBe('event');
    expect(frame.event).toBe('task.completed');
    expect(frame.payload).toEqual({ taskId: '123' });
    expect(frame.seq).toBe(5);
    expect(frame.stateVersion).toBe('v1');
  });

  it('should create an event frame with only event name', () => {
    const frame = createEventFrame('shutdown');

    expect(frame.type).toBe('event');
    expect(frame.event).toBe('shutdown');
    expect(frame.payload).toBeUndefined();
    expect(frame.seq).toBeUndefined();
    expect(frame.stateVersion).toBeUndefined();
  });

  it('should include seq=0 when explicitly provided', () => {
    const frame = createEventFrame('test', undefined, 0);

    expect(frame.seq).toBe(0);
  });
});

describe('ErrorCodes', () => {
  it('should have all expected error codes', () => {
    expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(ErrorCodes.CONNECTION_CLOSED).toBe('CONNECTION_CLOSED');
    expect(ErrorCodes.HANDSHAKE_TIMEOUT).toBe('HANDSHAKE_TIMEOUT');
    expect(ErrorCodes.INVALID_FRAME).toBe('INVALID_FRAME');
    expect(ErrorCodes.UNKNOWN_METHOD).toBe('UNKNOWN_METHOD');
    expect(ErrorCodes.INVALID_PARAMS).toBe('INVALID_PARAMS');
    expect(ErrorCodes.METHOD_FAILED).toBe('METHOD_FAILED');
    expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });
});

describe('Events', () => {
  it('should have all expected event names', () => {
    expect(Events.CONNECT_CHALLENGE).toBe('connect.challenge');
    expect(Events.CONNECT_SUCCESS).toBe('connect.success');
    expect(Events.TASK_CREATED).toBe('task.created');
    expect(Events.TASK_EVENT).toBe('task.event');
    expect(Events.HEARTBEAT).toBe('heartbeat');
    expect(Events.SHUTDOWN).toBe('shutdown');
  });
});

describe('Methods', () => {
  it('should have all expected method names', () => {
    expect(Methods.CONNECT).toBe('connect');
    expect(Methods.PING).toBe('ping');
    expect(Methods.HEALTH).toBe('health');
    expect(Methods.TASK_CREATE).toBe('task.create');
    expect(Methods.STATUS).toBe('status');
  });
});
