import type { LoggerInterface } from "../types/index.js"

/** Adapts a partial logger (e.g. BotClient) to the full {@link LoggerInterface} with no-op fallbacks. */
export function loggerFromPartial(
    loggerInstance: Partial<LoggerInterface> | undefined
): LoggerInterface {
    if (
        loggerInstance &&
        typeof loggerInstance.debug === "function" &&
        typeof loggerInstance.info === "function" &&
        typeof loggerInstance.warn === "function" &&
        typeof loggerInstance.error === "function"
    ) {
        const logger = loggerInstance as Partial<LoggerInterface>
        return {
            debug: (text: string, ...args: unknown[]) => logger.debug!(text, ...args),
            info: (text: string, ...args: unknown[]) => logger.info!(text, ...args),
            warn: (text: string, ...args: unknown[]) => logger.warn!(text, ...args),
            error: (text: string, ...args: unknown[]) => logger.error!(text, ...args),
            setDebugEnabled:
                typeof logger.setDebugEnabled === "function"
                    ? logger.setDebugEnabled.bind(logger)
                    : () => {},
            getDebugEnabled:
                typeof logger.getDebugEnabled === "function"
                    ? logger.getDebugEnabled.bind(logger)
                    : () => false,
            getLogFilePath:
                typeof logger.getLogFilePath === "function"
                    ? logger.getLogFilePath.bind(logger)
                    : () => null,
        }
    }
    return {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        setDebugEnabled: () => {},
        getDebugEnabled: () => false,
        getLogFilePath: () => null,
    }
}
