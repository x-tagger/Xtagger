/**
 * @module logger
 * @layer Shared (cross-cutting)
 * @description LoggerPort implementations. Two concrete loggers:
 *   - ConsoleLogger: structured output for development & extension context
 *   - NoopLogger: silences all output (used in unit tests)
 *
 * Usage: inject via constructor — never import console directly in modules.
 *
 * @example
 *   const log = new ConsoleLogger('TagService');
 *   log.info('Tag created', { tagId: '...', username: '...' });
 *   // → [XTagger:TagService] INFO  Tag created { tagId: '...', username: '...' }
 */

import type { LoggerPort, LogLevel } from '@core/ports/logger.port';

// ─── Console Logger ───────────────────────────────────────────────────────────

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class ConsoleLogger implements LoggerPort {
  private readonly minLevel: LogLevel;

  constructor(
    private readonly module: string,
    minLevel: LogLevel = 'info',
  ) {
    this.minLevel = minLevel;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  child(module: string): LoggerPort {
    return new ConsoleLogger(`${this.module}:${module}`, this.minLevel);
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) return;

    const prefix = `[XTagger:${this.module}]`;
    const levelTag = level.toUpperCase().padEnd(5);
    const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm

    switch (level) {
      case 'debug':
        // biome-ignore lint/suspicious/noConsoleLog: ConsoleLogger is the approved logging boundary
        console.log(prefix, levelTag, timestamp, message, ...(data ? [data] : []));
        break;
      case 'info':
        // biome-ignore lint/suspicious/noConsoleLog: ConsoleLogger is the approved logging boundary
        console.log(prefix, levelTag, timestamp, message, ...(data ? [data] : []));
        break;
      case 'warn':
        console.warn(prefix, levelTag, timestamp, message, ...(data ? [data] : []));
        break;
      case 'error':
        console.error(prefix, levelTag, timestamp, message, ...(data ? [data] : []));
        break;
    }
  }
}

// ─── Noop Logger ──────────────────────────────────────────────────────────────

export class NoopLogger implements LoggerPort {
  debug(_message: string, _data?: Record<string, unknown>): void {}
  info(_message: string, _data?: Record<string, unknown>): void {}
  warn(_message: string, _data?: Record<string, unknown>): void {}
  error(_message: string, _data?: Record<string, unknown>): void {}
  child(_module: string): LoggerPort {
    return this;
  }
}

export const noopLogger = new NoopLogger();
