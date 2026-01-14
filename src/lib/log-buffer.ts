/**
 * In-memory log buffer to store recent server logs for debugging
 */

interface LogEntry {
  timestamp: Date;
  level: "log" | "warn" | "error" | "info";
  message: string;
  data?: any;
}

class LogBuffer {
  private logs: LogEntry[] = [];
  private maxSize = 1000; // Keep last 1000 log entries

  add(level: LogEntry["level"], message: string, data?: any) {
    this.logs.push({
      timestamp: new Date(),
      level,
      message,
      data,
    });

    // Keep only the most recent logs
    if (this.logs.length > this.maxSize) {
      this.logs = this.logs.slice(-this.maxSize);
    }
  }

  log(message: string, data?: any) {
    this.add("log", message, data);
    console.log(message, data || "");
  }

  warn(message: string, data?: any) {
    this.add("warn", message, data);
    console.warn(message, data || "");
  }

  error(message: string, data?: any) {
    this.add("error", message, data);
    console.error(message, data || "");
  }

  info(message: string, data?: any) {
    this.add("info", message, data);
    console.log(`[INFO] ${message}`, data || "");
  }

  getLogs(filter?: { level?: LogEntry["level"]; search?: string; limit?: number }): LogEntry[] {
    let filtered = [...this.logs];

    if (filter?.level) {
      filtered = filtered.filter(log => log.level === filter.level);
    }

    if (filter?.search) {
      const searchLower = filter.search.toLowerCase();
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(searchLower) ||
        JSON.stringify(log.data || {}).toLowerCase().includes(searchLower)
      );
    }

    if (filter?.limit) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered.reverse(); // Most recent first
  }

  clear() {
    this.logs = [];
  }

  getStats() {
    const byLevel = {
      log: this.logs.filter(l => l.level === "log").length,
      warn: this.logs.filter(l => l.level === "warn").length,
      error: this.logs.filter(l => l.level === "error").length,
      info: this.logs.filter(l => l.level === "info").length,
    };

    return {
      total: this.logs.length,
      byLevel,
      oldest: this.logs[0]?.timestamp,
      newest: this.logs[this.logs.length - 1]?.timestamp,
    };
  }
}

// Singleton instance
export const logBuffer = new LogBuffer();

// Helper function to wrap console methods
export function createLogger(prefix: string) {
  return {
    log: (message: string, ...args: any[]) => {
      const fullMessage = `[${prefix}] ${message}`;
      logBuffer.log(fullMessage, args.length > 0 ? args : undefined);
    },
    warn: (message: string, ...args: any[]) => {
      const fullMessage = `[${prefix}] ${message}`;
      logBuffer.warn(fullMessage, args.length > 0 ? args : undefined);
    },
    error: (message: string, ...args: any[]) => {
      const fullMessage = `[${prefix}] ${message}`;
      logBuffer.error(fullMessage, args.length > 0 ? args : undefined);
    },
    info: (message: string, ...args: any[]) => {
      const fullMessage = `[${prefix}] ${message}`;
      logBuffer.info(fullMessage, args.length > 0 ? args : undefined);
    },
  };
}
