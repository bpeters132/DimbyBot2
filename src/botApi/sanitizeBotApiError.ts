/** Redacts credentials and long base64-like blobs from bot API error strings before JSON responses. */
export function redactBotApiErrorText(text: string): string {
    return text
        .replace(/(token|secret|password|cookie)\s*[=:]\s*[^\s]+/gi, "$1=[redacted]")
        .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
        .replace(/([a-z][a-z0-9+.-]*:\/\/)[^@/?#\s]+@/gi, "$1[redacted]@")
        .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
}

/** Safe error shape for bot API JSON error responses (no raw secrets / stacks). */
export function sanitizeBotApiError(err: unknown): {
    name: string
    message: string
    safeStack?: string
} {
    if (err instanceof Error) {
        const redactedMessage = redactBotApiErrorText(err.message)
        const firstLine = err.stack?.split("\n")[0]
        const safeStack = firstLine ? redactBotApiErrorText(firstLine) : undefined
        return { name: err.name, message: redactedMessage, safeStack }
    }
    if (typeof err === "string") {
        return { name: "Error", message: "[redacted]" }
    }
    return { name: "UnknownError", message: "Unexpected error shape" }
}
