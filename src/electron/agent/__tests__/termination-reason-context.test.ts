/**
 * Tests for CommandTerminationReason context prefix formatting
 * Tests the logic that adds context prefixes to tool results based on termination reason
 */

import { describe, it, expect } from 'vitest';
import type { CommandTerminationReason } from '../../../shared/types';

/**
 * Generates context prefix for run_command results based on termination reason
 * This mirrors the logic in executor.ts
 */
function getTerminationContextPrefix(terminationReason: CommandTerminationReason): string {
  switch (terminationReason) {
    case 'user_stopped':
      return '[USER STOPPED] The user intentionally interrupted this command. ' +
        'Do not retry automatically. Ask the user if they want you to continue or try a different approach.\n\n';
    case 'timeout':
      return '[TIMEOUT] Command exceeded time limit. ' +
        'Consider: 1) Breaking into smaller steps, 2) Using a longer timeout if available, 3) Asking the user to run this manually.\n\n';
    case 'error':
      return '[EXECUTION ERROR] The command could not be spawned or executed properly.\n\n';
    case 'normal':
    default:
      return '';
  }
}

describe('Termination Reason Context Prefix', () => {
  describe('getTerminationContextPrefix', () => {
    it('should return USER STOPPED prefix for user_stopped reason', () => {
      const prefix = getTerminationContextPrefix('user_stopped');

      expect(prefix).toContain('[USER STOPPED]');
      expect(prefix).toContain('intentionally interrupted');
      expect(prefix).toContain('Do not retry automatically');
    });

    it('should return TIMEOUT prefix for timeout reason', () => {
      const prefix = getTerminationContextPrefix('timeout');

      expect(prefix).toContain('[TIMEOUT]');
      expect(prefix).toContain('exceeded time limit');
      expect(prefix).toContain('Breaking into smaller steps');
    });

    it('should return EXECUTION ERROR prefix for error reason', () => {
      const prefix = getTerminationContextPrefix('error');

      expect(prefix).toContain('[EXECUTION ERROR]');
      expect(prefix).toContain('could not be spawned');
    });

    it('should return empty string for normal reason', () => {
      const prefix = getTerminationContextPrefix('normal');

      expect(prefix).toBe('');
    });
  });

  describe('context prefix application to tool results', () => {
    it('should prepend prefix to result content for user_stopped', () => {
      const terminationReason: CommandTerminationReason = 'user_stopped';
      const originalResult = '{"success":false,"stdout":"","stderr":"","exitCode":130}';

      const prefix = getTerminationContextPrefix(terminationReason);
      const finalResult = prefix ? prefix + originalResult : originalResult;

      expect(finalResult).toMatch(/^\[USER STOPPED\]/);
      expect(finalResult).toContain(originalResult);
    });

    it('should not modify result content for normal termination', () => {
      const terminationReason: CommandTerminationReason = 'normal';
      const originalResult = '{"success":true,"stdout":"hello","stderr":"","exitCode":0}';

      const prefix = getTerminationContextPrefix(terminationReason);
      const finalResult = prefix ? prefix + originalResult : originalResult;

      expect(finalResult).toBe(originalResult);
    });

    it('should handle all termination reasons consistently', () => {
      const reasons: CommandTerminationReason[] = ['normal', 'user_stopped', 'timeout', 'error'];

      for (const reason of reasons) {
        const prefix = getTerminationContextPrefix(reason);

        // All prefixes should either be empty or end with double newline for formatting
        if (prefix) {
          expect(prefix).toMatch(/\n\n$/);
        }
      }
    });
  });

  describe('LLM guidance quality', () => {
    it('should provide actionable guidance for user_stopped', () => {
      const prefix = getTerminationContextPrefix('user_stopped');

      // Should tell LLM not to retry
      expect(prefix.toLowerCase()).toContain('do not retry');
      // Should suggest asking user
      expect(prefix.toLowerCase()).toContain('ask');
    });

    it('should provide actionable guidance for timeout', () => {
      const prefix = getTerminationContextPrefix('timeout');

      // Should provide multiple options
      expect(prefix).toContain('1)');
      expect(prefix).toContain('2)');
      expect(prefix).toContain('3)');
    });
  });
});
