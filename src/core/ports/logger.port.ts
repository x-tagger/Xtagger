/**
 * @module logger.port
 * @layer Core / Ports
 * @description Structured logging interface. NO console.log in production code.
 * Every log entry has a level, a module tag, a message, and optional structured data.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly level: LogLevel;
  readonly module: string;
  readonly message: string;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly timestamp: number;
}

export interface LoggerPort {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  /** Create a child logger with a module prefix */
  child(module: string): LoggerPort;
}

/** No-op logger for tests where log output is unwanted */
export const noopLogger: LoggerPort = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
};
