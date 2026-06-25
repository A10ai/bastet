/**
 * HospitAI Client-Safe Structured Logger
 *
 * Mirrors the API of src/lib/logger.ts (server-only pino wrapper) but is safe
 * to import from client components ("use client"). Uses console.* under the
 * hood with a structured prefix so client-side logs remain consistent with
 * the server logger output shape.
 *
 * Usage:
 *   import { logger } from "@/lib/client-logger";
 *   logger.error({ err }, "Failed to fetch brain data");
 *   logger.info("Loaded dashboard");
 */

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

interface LogContext {
  [key: string]: unknown;
}

interface ClientLogger {
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
  child(bindings: LogContext): ClientLogger;
}

function consoleForLevel(level: LogLevel): (...args: unknown[]) => void {
  switch (level) {
    case "fatal":
    case "error":
      return console.error.bind(console);
    case "warn":
      return console.warn.bind(console);
    case "info":
      return console.info.bind(console);
    case "debug":
    case "trace":
    default:
      return console.log.bind(console);
  }
}

function emit(level: LogLevel, bindings: LogContext, objOrMsg: LogContext | string, msg?: string): void {
  const context = typeof objOrMsg === "string" ? {} : objOrMsg;
  const message = typeof objOrMsg === "string" ? objOrMsg : msg || "";
  const merged = { ...bindings, ...context };
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}] [hospitai]`;
  const fn = consoleForLevel(level);
  if (Object.keys(merged).length > 0) {
    fn(prefix, message, merged);
  } else {
    fn(prefix, message);
  }
}

function makeLogger(bindings: LogContext): ClientLogger {
  const wrap = (level: LogLevel) =>
    (objOrMsg: LogContext | string, msg?: string) =>
      emit(level, bindings, objOrMsg, msg);

  return {
    fatal: wrap("fatal"),
    error: wrap("error"),
    warn: wrap("warn"),
    info: wrap("info"),
    debug: wrap("debug"),
    trace: wrap("trace"),
    child(extra: LogContext) {
      return makeLogger({ ...bindings, ...extra });
    },
  };
}

/** Client-safe logger — same interface as the server logger. */
export const logger: ClientLogger = makeLogger({});

/** Create a scoped child logger with a module name. */
export function createLogger(module: string): ClientLogger {
  return logger.child({ module });
}