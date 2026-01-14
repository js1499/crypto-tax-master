/**
 * Production-safe logging utility
 * Only logs in development mode to prevent information leakage and performance issues
 */

type LogLevel = "log" | "error" | "warn" | "info" | "debug";

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";

  private formatMessage(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.isDevelopment) {
      return; // Don't log in production
    }

    const prefix = `[${level.toUpperCase()}]`;
    switch (level) {
      case "error":
        console.error(prefix, message, ...args);
        break;
      case "warn":
        console.warn(prefix, message, ...args);
        break;
      case "info":
      case "debug":
      case "log":
      default:
        console.log(prefix, message, ...args);
        break;
    }
  }

  log(message: string, ...args: any[]): void {
    this.formatMessage("log", message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.formatMessage("error", message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.formatMessage("warn", message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.formatMessage("info", message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.formatMessage("debug", message, ...args);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for backward compatibility
export default logger;
