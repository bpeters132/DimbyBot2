import type { LoggerInterface } from "../types/index.js"

/** Adapts a partial logger (e.g. BotClient) to the full {@link LoggerInterface} with no-op fallbacks. */
export function loggerFromPartial(
    loggerInstance: Partial<LoggerInterface> | undefined
): LoggerInterface {
    const logger = loggerInstance
    return {
        debug: logger && typeof logger.debug === "function" ? logger.debug.bind(logger) : () => {},
        info: logger && typeof logger.info === "function" ? logger.info.bind(logger) : () => {},
        warn: logger && typeof logger.warn === "function" ? logger.warn.bind(logger) : () => {},
        error: logger && typeof logger.error === "function" ? logger.error.bind(logger) : () => {},
        setDebugEnabled:
            logger && typeof logger.setDebugEnabled === "function"
                ? logger.setDebugEnabled.bind(logger)
                : () => {},
        getDebugEnabled:
            logger && typeof logger.getDebugEnabled === "function"
                ? logger.getDebugEnabled.bind(logger)
                : () => false,
        getLogFilePath:
            logger && typeof logger.getLogFilePath === "function"
                ? logger.getLogFilePath.bind(logger)
                : () => null,
    }
}
