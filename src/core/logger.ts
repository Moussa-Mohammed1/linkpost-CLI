export type LogLevel = "debug" | "info" | "warn" | "error";

const PREFIX: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

export interface LogSink {
  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void;
}

/**
 * Structured, buffer-backed logger. Every message is also written to a
 * capturing sink (used to produce `logs.txt`) and optionally to stdout.
 */
export class Logger implements LogSink {
  private buffer: string[] = [];
  private minLevel: number;
  private sinks: LogSink[] = [];

  constructor(opts: { level?: LogLevel; stdout?: boolean } = {}) {
    this.minLevel = LEVELS[opts.level ?? "info"];
    if (opts.stdout) {
      this.sinks.push({
        log: (_lvl, message) => process.stdout.write(`post: ${message}\n`),
      });
    }
  }

  addSink(sink: LogSink): void {
    this.sinks.push(sink);
  }

  log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
    if (LEVELS[level] < this.minLevel) return;
    const ts = new Date().toISOString();
    const line = meta === undefined || Object.keys(meta).length === 0
      ? `[${ts}] ${PREFIX[level]} ${message}`
      : `[${ts}] ${PREFIX[level]} ${message} ${JSON.stringify(meta)}`;
    this.buffer.push(line);
    for (const sink of this.sinks) sink.log(level, message, meta);
  }

  debug(message: string, meta: Record<string, unknown> = {}): void {
    this.log("debug", message, meta);
  }
  info(message: string, meta: Record<string, unknown> = {}): void {
    this.log("info", message, meta);
  }
  warn(message: string, meta: Record<string, unknown> = {}): void {
    this.log("warn", message, meta);
  }
  error(message: string, meta: Record<string, unknown> = {}): void {
    this.log("error", message, meta);
  }

  /** Every buffered line (used to render `logs.txt`). */
  toText(): string {
    return this.buffer.join("\n") + (this.buffer.length ? "\n" : "");
  }
}

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };