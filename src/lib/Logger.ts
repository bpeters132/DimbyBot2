import winston from "winston"
import colors from "colors"
import type { DiscordLogForwarder, DiscordLogLevelName, LoggerInterface } from "../types/index.js"

/**
 * A simple logger class that logs to both the console with colors and a file.
 */
export default class Logger implements LoggerInterface {
    private logFilePath: string | null
    private debugEnabled: boolean
    private logger: winston.Logger
    private discordForwarder: DiscordLogForwarder | null = null

    constructor(file?: string) {
        this.logFilePath = file ?? null
        this.debugEnabled = process.env.LOG_LEVEL?.toLowerCase() === "debug"
        if (!file) {
            console.warn("Logger Warning: No log file path provided. File logging disabled.")
            this.logger = winston.createLogger({ silent: true })
        } else {
            try {
                const fileLogFormat = winston.format.combine(
                    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
                    winston.format.errors({ stack: true }),
                    winston.format.splat(),
                    winston.format.printf(({ level, message, timestamp, stack }) => {
                        return `${timestamp} [${level.toUpperCase()}]: ${message}${stack ? "\n" + stack : ""}`
                    })
                )

                this.logger = winston.createLogger({
                    format: fileLogFormat,
                    transports: [
                        new winston.transports.File({
                            filename: file,
                        }),
                    ],
                })
            } catch (error) {
                console.error(`Logger Error: Failed to create file transport for ${file}:`, error)
                this.logger = winston.createLogger({ silent: true })
            }
        }

        this._applyDebugLevel()
    }

    private _applyDebugLevel() {
        this.logger.level = this.debugEnabled ? "debug" : "info"
    }

    /**
     * Enables or disables debug logging for this logger instance.
     * Also assigns `process.env.LOG_LEVEL` to `"debug"` or `"info"` so other modules that read
     * the environment stay aligned; be aware that mutating `process.env` is a global side effect.
     * `_applyDebugLevel()` updates the Winston logger level locally.
     */
    setDebugEnabled(enabled: boolean) {
        this.debugEnabled = Boolean(enabled)
        process.env.LOG_LEVEL = this.debugEnabled ? "debug" : "info"
        this._applyDebugLevel()
    }

    getDebugEnabled() {
        return this.debugEnabled
    }

    getLogFilePath() {
        return this.logFilePath
    }

    setDiscordForwarder(callback: DiscordLogForwarder | null) {
        this.discordForwarder = callback
    }

    private _notifyDiscord(level: DiscordLogLevelName, fullMessage: string) {
        if (!this.discordForwarder) {
            return
        }
        try {
            this.discordForwarder(level, fullMessage)
        } catch (err: unknown) {
            console.error("[Logger] discordForwarder threw (swallowed):", err)
        }
    }

    private _getTimestamp() {
        const d = new Date()
        const y = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, "0")
        const day = String(d.getDate()).padStart(2, "0")
        const hour = String(d.getHours()).padStart(2, "0")
        const minute = String(d.getMinutes()).padStart(2, "0")
        return `[${y}-${month}-${day} ${hour}:${minute}]`
    }

    private _formatArgs(args: unknown[]) {
        return args
            .map((arg) => {
                if (arg instanceof Error) {
                    return arg.stack || arg.message
                }
                if (typeof arg === "object" && arg !== null) {
                    try {
                        return JSON.stringify(arg)
                    } catch {
                        return "[Unserializable Object]"
                    }
                }
                return String(arg)
            })
            .join(" ")
    }

    info(text: string, ...args: unknown[]) {
        const messageArgs = this._formatArgs(args)
        const fullMessage = text + (messageArgs ? " " + messageArgs : "")
        this.logger.info(fullMessage)
        console.log(colors.gray(this._getTimestamp()) + colors.green(` | INFO | ${fullMessage}`))
        this._notifyDiscord("info", fullMessage)
    }

    warn(text: string, ...args: unknown[]) {
        const messageArgs = this._formatArgs(args)
        const fullMessage = text + (messageArgs ? " " + messageArgs : "")
        this.logger.warn(fullMessage)
        console.log(colors.gray(this._getTimestamp()) + colors.yellow(` | WARN | ${fullMessage}`))
        this._notifyDiscord("warn", fullMessage)
    }

    error(text: string, ...args: unknown[]) {
        const errorArg = args.find((arg): arg is Error => arg instanceof Error)
        const argsForMessage = errorArg ? args.filter((a) => !(a instanceof Error)) : args
        const messageArgs = this._formatArgs(argsForMessage)
        const fullMessage = text + (messageArgs ? " " + messageArgs : "")
        if (errorArg) {
            this.logger.error(fullMessage, { error: errorArg })
        } else {
            this.logger.error(fullMessage)
        }
        console.log(colors.gray(this._getTimestamp()) + colors.red(` | ERROR | ${fullMessage}`))
        this._notifyDiscord("error", fullMessage)
    }

    debug(text: string, ...args: unknown[]) {
        if (!this.debugEnabled) {
            return
        }
        const messageArgs = this._formatArgs(args)
        const fullMessage = text + (messageArgs ? " " + messageArgs : "")
        this.logger.debug(fullMessage)
        console.log(colors.gray(this._getTimestamp()) + colors.magenta(` | DEBUG | ${fullMessage}`))
        this._notifyDiscord("debug", fullMessage)
    }
}
