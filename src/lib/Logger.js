import winston from "winston"
import colors from "colors"

// Simple logger class using Winston for file logging and console.log with colors
export default class Logger {
  constructor(file) {
    // Basic Winston setup for file transport only
    if (!file) {
      console.warn("Logger Warning: No log file path provided. File logging disabled.")
      this.logger = winston.createLogger({ transports: [] }) // Empty logger if no path
    } else {
      try {
        // Define format for file logging, including Winston's timestamp
        const fileLogFormat = winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Use Winston timestamp
          winston.format.errors({ stack: true }), // Log stack trace for errors
          winston.format.splat(),
          winston.format.printf(({ level, message, timestamp, stack }) => {
            // Include stack trace in the message if it exists
            return `${timestamp} [${level.toUpperCase()}]: ${message}${stack ? '\n' + stack : ''}`
          })
        )

        this.logger = winston.createLogger({
          // Note: Winston's top-level 'level' only filters *before* transports.
          // We handle debug filtering manually in the debug() method for console.
          // File transport level is implicitly 'info' or higher unless overridden.
          format: fileLogFormat, // Apply the defined format to all transports
          transports: [
             new winston.transports.File({
                 filename: file,
                 // Optionally set level specifically for file transport if needed
                 // level: 'debug' // Uncomment if you always want debug in file regardless of LOG_LEVEL check for console
             })
          ],
        })
      } catch (error) {
        console.error(`Logger Error: Failed to create file transport for ${file}:`, error)
        this.logger = winston.createLogger({ transports: [] }) // Fallback to empty logger
      }
    }
  }

  // Helper to format date/time for *console* output (keeps existing format)
  _getTimestamp() {
    const d = new Date()
    // Pad month, day, hour, minute for consistent formatting
    const month = String(d.getMonth() + 1).padStart(2, "0") // Months are 0-indexed
    const day = String(d.getDate()).padStart(2, "0")
    const hour = String(d.getHours()).padStart(2, "0")
    const minute = String(d.getMinutes()).padStart(2, "0")
    return `[${day}:${month}:${d.getFullYear()} - ${hour}:${minute}]`
  }

  // Helper to format args array (handles objects/errors better than simple concatenation)
  _formatArgs(args) {
    return args
      .map((arg) => {
        if (arg instanceof Error) {
          return arg.stack || arg.message
        }
        if (typeof arg === "object" && arg !== null) {
          try {
            return JSON.stringify(arg)
          } catch (e) {
            return "[Unserializable Object]"
          }
        }
        return String(arg)
      })
      .join(" ")
  }

  info(text, ...args) {
    const messageArgs = this._formatArgs(args)
    const fullMessage = text + (messageArgs ? " " + messageArgs : "")
    // Log to file using Winston (will use Winston timestamp format)
    this.logger.info(fullMessage) // Pass only the core message
    // Log to console using custom timestamp and colors
    console.log(colors.gray(this._getTimestamp()) + colors.green(` | INFO | ${fullMessage}`))
  }

  warn(text, ...args) {
    const messageArgs = this._formatArgs(args)
    const fullMessage = text + (messageArgs ? " " + messageArgs : "")
    // Log to file using Winston (will use Winston timestamp format)
    this.logger.warn(fullMessage)
    // Log to console using custom timestamp and colors
    console.log(colors.gray(this._getTimestamp()) + colors.yellow(` | WARN | ${fullMessage}`))
  }

  error(text, ...args) {
    const messageArgs = this._formatArgs(args)
    const fullMessage = text + (messageArgs ? " " + messageArgs : "")
    // Log to file using Winston (will use Winston timestamp format)
    // Pass error object directly if possible for better stack trace logging
    const errorArg = args.find(arg => arg instanceof Error)
    if (errorArg) {
        this.logger.error(fullMessage, { error: errorArg })
    } else {
        this.logger.error(fullMessage)
    }
    // Log to console using custom timestamp and colors
    console.log(colors.gray(this._getTimestamp()) + colors.red(` | ERROR| ${fullMessage}`))
  }

  debug(text, ...args) {
    // Only proceed if LOG_LEVEL enables debug
    if (process.env.LOG_LEVEL?.toLowerCase() !== "debug") {
      return // Skip debug logging
    }
    const messageArgs = this._formatArgs(args)
    const fullMessage = text + (messageArgs ? " " + messageArgs : "")
    // Log to file using Winston (will use Winston timestamp format)
    this.logger.debug(fullMessage)
    // Log to console using custom timestamp and colors
    console.log(colors.gray(this._getTimestamp()) + colors.magenta(` | DEBUG| ${fullMessage}`))
  }
}
