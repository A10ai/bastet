import "server-only";

/**
 * HospitAI Structured Logger
 *
 * Wraps pino with sensible defaults for HospitAI.
 * In production: JSON logs to stdout (parseable by log aggregators).
 * In development: pretty-printed colour logs.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info({ module: "ai-brain", cycleId }, "Brain cycle completed");
 *   logger.error({ err, route }, "Request failed");
 */

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

interface LogContext {
  [key: string]: unknown;
}

// Minimal pino-compatible interface (avoids importing pino types at module level)
interface PinoLogger {
  fatal(obj: LogContext, msg?: string): void;
  fatal(msg: string): void;
  error(obj: LogContext, msg?: string): void;
  error(msg: string): void;
  warn(obj: LogContext, msg?: string): void;
  warn(msg: string): void;
  info(obj: LogContext, msg?: string): void;
  info(msg: string): void;
  debug(obj: LogContext, msg?: string): void;
  debug(msg: string): void;
  trace(obj: LogContext, msg?: string): void;
  trace(msg: string): void;
  child(bindings: LogContext): PinoLogger;
}

// Lazy-loaded pino instance — avoids requiring pino at import time if not installed
let _pinoInstance: PinoLogger | null = null;

function createPinoInstance(): PinoLogger {
  const isDev = process.env.NODE_ENV === "development";
  const level = (process.env.LOG_LEVEL as LogLevel) || (isDev ? "debug" : "info");

  // Try to load pino; fall back to console shim if not installed
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const pino = require("pino");
    const opts = {
      level,
      base: {
        service: "hospitai",
        env: process.env.NODE_ENV || "development",
      },
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      ...(isDev
        ? {
            transport: {
              target: "pino-pretty",
              options: {
                colorize: true,
                translateTime: "HH:MM:ss",
                ignore: "pid,hostname,service,env",
              },
            },
          }
        : {}),
    };
    return pino(opts) as PinoLogger;
  } catch {
    // Fallback: console-based logger with same interface
    const consoleLog = (level: LogLevel) => {
      return (objOrMsg: LogContext | string, msg?: string) => {
        const context = typeof objOrMsg === "string" ? {} : objOrMsg;
        const message = typeof objOrMsg === "string" ? objOrMsg : msg || "";
        const ts = new Date().toISOString();
        const prefix = `[${ts}] [${level.toUpperCase()}] [hospitai]`;
        if (Object.keys(context).length > 0) {
          console[level === "fatal" ? "error" : level === "trace" ? "log" : level](prefix, message, context);
        } else {
          console[level === "fatal" ? "error" : level === "trace" ? "log" : level](prefix, message);
        }
      };
    };

    const fallback: PinoLogger = {
      fatal: consoleLog("fatal"),
      error: consoleLog("error"),
      warn: consoleLog("warn"),
      info: consoleLog("info"),
      debug: consoleLog("debug"),
      trace: consoleLog("trace"),
      child(bindings: LogContext) {
        // Simple child: just prepend module to context
        return {
          fatal: (o: LogContext | string, m?: string) => fallback.fatal({ ...bindings, ...(typeof o === "object" ? o : {}) }, typeof o === "string" ? o : m),
          error: (o: LogContext | string, m?: string) => fallback.error({ ...bindings, ...(typeof o === "object" ? o : {}) }, typeof o === "string" ? o : m),
          warn: (o: LogContext | string, m?: string) => fallback.warn({ ...bindings, ...(typeof o === "object" ? o : {}) }, typeof o === "string" ? o : m),
          info: (o: LogContext | string, m?: string) => fallback.info({ ...bindings, ...(typeof o === "object" ? o : {}) }, typeof o === "string" ? o : m),
          debug: (o: LogContext | string, m?: string) => fallback.debug({ ...bindings, ...(typeof o === "object" ? o : {}) }, typeof o === "string" ? o : m),
          trace: (o: LogContext | string, m?: string) => fallback.trace({ ...bindings, ...(typeof o === "object" ? o : {}) }, typeof o === "string" ? o : m),
          child: (b: LogContext) => fallback.child({ ...bindings, ...b }),
        };
      },
    };
    return fallback;
  }
}

/** Get the singleton pino instance (lazy-loaded). */
function getLogger(): PinoLogger {
  if (!_pinoInstance) {
    _pinoInstance = createPinoInstance();
  }
  return _pinoInstance;
}

/** Primary logger — use directly or call .child({ module: "..." }) for scoped logging. */
export const logger: PinoLogger = new Proxy({} as PinoLogger, {
  get(_target, prop: string) {
    const instance = getLogger();
    const value = (instance as any)[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

/** Create a scoped child logger with a module name. */
export function createLogger(module: string): PinoLogger {
  return logger.child({ module });
}