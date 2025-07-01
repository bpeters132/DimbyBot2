import winston from "winston"
import colors from "colors"
import fs from "fs"
import path from "path"

// Enhanced logger class with better error reporting and metrics
export default class Logger {
  constructor(file, options = {}) {
    this.metrics = {
      errors: 0,
      warnings: 0,
      info: 0,
      debug: 0,
      startTime: new Date(),
      lastErrorTime: null,
      errorsByType: new Map(),
      performanceMetrics: new Map()
    }

    // Enhanced options
    this.options = {
      enableFileRotation: options.enableFileRotation ?? true,
      maxFileSize: options.maxFileSize ?? 50 * 1024 * 1024, // 50MB
      maxFiles: options.maxFiles ?? 10,
      enableMetrics: options.enableMetrics ?? true,
      enableErrorTracking: options.enableErrorTracking ?? true,
      ...options
    }

    // Setup Winston logger
    this._setupWinston(file)
    
    // Setup error tracking
    if (this.options.enableErrorTracking) {
      this._setupErrorTracking()
    }

    // Setup periodic metrics logging
    if (this.options.enableMetrics) {
      this._setupMetricsLogging()
    }
  }

  _setupWinston(file) {
    const transports = []

    if (file) {
      try {
        // Ensure log directory exists
        const logDir = path.dirname(file)
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true })
        }

        // Enhanced file format with more context
        const fileLogFormat = winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
          winston.format.errors({ stack: true }),
          winston.format.splat(),
          winston.format.json(), // Use JSON format for better parsing
          winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
            const baseLog = {
              timestamp,
              level: level.toUpperCase(),
              message,
              pid: process.pid,
              memory: process.memoryUsage(),
              ...meta
            }
            
            if (stack) {
              baseLog.stack = stack
            }
            
            return JSON.stringify(baseLog)
          })
        )

        // Add file transport with rotation
        if (this.options.enableFileRotation) {
          transports.push(new winston.transports.File({
            filename: file,
            format: fileLogFormat,
            maxsize: this.options.maxFileSize,
            maxFiles: this.options.maxFiles,
            tailable: true
          }))
        } else {
          transports.push(new winston.transports.File({
            filename: file,
            format: fileLogFormat
          }))
        }

        // Add error-specific log file
        const errorFile = file.replace('.log', '-errors.log')
        transports.push(new winston.transports.File({
          filename: errorFile,
          level: 'error',
          format: fileLogFormat,
          maxsize: this.options.maxFileSize,
          maxFiles: this.options.maxFiles
        }))

      } catch (error) {
        console.error(`Logger Error: Failed to create file transport for ${file}:`, error)
      }
    }

    // Add console transport for development
    if (process.env.NODE_ENV !== 'production') {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }))
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL?.toLowerCase() || 'info',
      transports,
      exitOnError: false,
      // Add uncaught exception handling
      exceptionHandlers: file ? [
        new winston.transports.File({ 
          filename: file.replace('.log', '-exceptions.log'),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        })
      ] : [],
      // Add unhandled rejection handling
      rejectionHandlers: file ? [
        new winston.transports.File({ 
          filename: file.replace('.log', '-rejections.log'),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        })
      ] : []
    })
  }

  _setupErrorTracking() {
    // Track unique errors and their frequency
    this.errorCache = new Map()
    
    // Setup process-level error handlers
    process.on('uncaughtException', (error) => {
      this.error('Uncaught Exception:', error)
      // Don't exit immediately, let Winston handle it
    })

    process.on('unhandledRejection', (reason, promise) => {
      this.error('Unhandled Rejection at:', promise, 'reason:', reason)
    })

    process.on('warning', (warning) => {
      this.warn('Process warning:', warning)
    })
  }

  _setupMetricsLogging() {
    // Log metrics every 5 minutes
    setInterval(() => {
      this._logMetrics()
    }, 5 * 60 * 1000)
  }

  _logMetrics() {
    const uptime = Date.now() - this.metrics.startTime.getTime()
    const memUsage = process.memoryUsage()
    
    const metricsData = {
      uptime: Math.floor(uptime / 1000), // in seconds
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024) // MB
      },
      logCounts: {
        errors: this.metrics.errors,
        warnings: this.metrics.warnings,
        info: this.metrics.info,
        debug: this.metrics.debug
      },
      errorsByType: Object.fromEntries(this.metrics.errorsByType),
      performance: Object.fromEntries(this.metrics.performanceMetrics)
    }

    this.logger.info('System Metrics', { metrics: metricsData, type: 'METRICS' })
  }

  // Helper to format date/time for console output
  _getTimestamp() {
    const d = new Date()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    const hour = String(d.getHours()).padStart(2, "0")
    const minute = String(d.getMinutes()).padStart(2, "0")
    const second = String(d.getSeconds()).padStart(2, "0")
    return `[${day}:${month}:${d.getFullYear()} - ${hour}:${minute}:${second}]`
  }

  // Helper to format arguments
  _formatArgs(args) {
    return args
      .map((arg) => {
        if (arg instanceof Error) {
          return arg.stack || arg.message
        }
        if (typeof arg === "object" && arg !== null) {
          try {
            return JSON.stringify(arg, null, 2)
          } catch (e) {
            return "[Unserializable Object]"
          }
        }
        return String(arg)
      })
      .join(" ")
  }

  // Enhanced logging methods with context and metadata
  info(text, ...args) {
    this.metrics.info++
    const messageArgs = this._formatArgs(args)
    const fullMessage = text + (messageArgs ? " " + messageArgs : "")
    
    // Extract metadata from args
    const metadata = this._extractMetadata(args)
    
    this.logger.info(fullMessage, metadata)
    console.log(colors.gray(this._getTimestamp()) + colors.green(` | INFO | ${fullMessage}`))
  }

  warn(text, ...args) {
    this.metrics.warnings++
    const messageArgs = this._formatArgs(args)
    const fullMessage = text + (messageArgs ? " " + messageArgs : "")
    
    const metadata = this._extractMetadata(args)
    
    this.logger.warn(fullMessage, metadata)
    console.log(colors.gray(this._getTimestamp()) + colors.yellow(` | WARN | ${fullMessage}`))
  }

  error(text, ...args) {
    this.metrics.errors++
    this.metrics.lastErrorTime = new Date()
    
    const messageArgs = this._formatArgs(args)
    const fullMessage = text + (messageArgs ? " " + messageArgs : "")
    
    // Track error types
    const errorArg = args.find(arg => arg instanceof Error)
    if (errorArg) {
      const errorType = errorArg.constructor.name
      this.metrics.errorsByType.set(errorType, (this.metrics.errorsByType.get(errorType) || 0) + 1)
      
      // Enhanced error logging with stack trace
      this.logger.error(fullMessage, {
        error: {
          name: errorArg.name,
          message: errorArg.message,
          stack: errorArg.stack,
          type: errorType
        },
        ...this._extractMetadata(args)
      })
    } else {
      this.logger.error(fullMessage, this._extractMetadata(args))
    }
    
    console.log(colors.gray(this._getTimestamp()) + colors.red(` | ERROR | ${fullMessage}`))
  }

  debug(text, ...args) {
    if (process.env.LOG_LEVEL?.toLowerCase() !== "debug") {
      return
    }
    
    this.metrics.debug++
    const messageArgs = this._formatArgs(args)
    const fullMessage = text + (messageArgs ? " " + messageArgs : "")
    
    const metadata = this._extractMetadata(args)
    
    this.logger.debug(fullMessage, metadata)
    console.log(colors.gray(this._getTimestamp()) + colors.magenta(` | DEBUG | ${fullMessage}`))
  }

  // New method for performance tracking
  time(label) {
    const startTime = process.hrtime.bigint()
    this.metrics.performanceMetrics.set(label, { startTime, endTime: null, duration: null })
    this.debug(`Timer started: ${label}`)
  }

  timeEnd(label) {
    const metric = this.metrics.performanceMetrics.get(label)
    if (metric) {
      metric.endTime = process.hrtime.bigint()
      metric.duration = Number(metric.endTime - metric.startTime) / 1000000 // Convert to milliseconds
      this.debug(`Timer ended: ${label} (${metric.duration.toFixed(2)}ms)`)
      return metric.duration
    }
    this.warn(`Timer not found: ${label}`)
    return null
  }

  // Method to log structured data
  logStructured(level, message, data = {}) {
    const structuredData = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...data
    }
    
    this.logger.log(level, message, structuredData)
  }

  // Method to get current metrics
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.startTime.getTime(),
      memory: process.memoryUsage()
    }
  }

  // Helper to extract metadata from arguments
  _extractMetadata(args) {
    const metadata = {}
    
    // Look for objects that aren't errors and use them as metadata
    args.forEach((arg, index) => {
      if (typeof arg === 'object' && arg !== null && !(arg instanceof Error)) {
        if (arg.guildId) metadata.guildId = arg.guildId
        if (arg.userId) metadata.userId = arg.userId
        if (arg.channelId) metadata.channelId = arg.channelId
        if (arg.commandName) metadata.commandName = arg.commandName
        if (arg.type && typeof arg.type === 'string') metadata.type = arg.type
      }
    })
    
    return metadata
  }

  // Method to create child logger with context
  createChild(context = {}) {
    const childLogger = Object.create(this)
    childLogger.context = context
    
    // Override logging methods to include context
    const originalMethods = ['info', 'warn', 'error', 'debug']
    originalMethods.forEach(method => {
      const originalMethod = this[method].bind(this)
      childLogger[method] = (text, ...args) => {
        return originalMethod(text, ...args, context)
      }
    })
    
    return childLogger
  }
}
