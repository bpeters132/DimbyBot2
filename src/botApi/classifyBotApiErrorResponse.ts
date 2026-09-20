import { BotClientNotInitializedError } from "../lib/botClientRegistry.js"
import { sanitizeBotApiError } from "./sanitizeBotApiError.js"

export type BotApiClassifiedError = {
    status: number
    body: { ok: false; error: { error: string; details?: string } }
}

/** Express `express.json()` parse failures (`entity.parse.failed`). */
function isExpressJsonParseError(err: unknown): boolean {
    return (
        err instanceof SyntaxError &&
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        "type" in err &&
        (err as { status?: unknown; type?: unknown }).status === 400 &&
        (err as { type?: unknown }).type === "entity.parse.failed"
    )
}

/**
 * 4xx from `status` (preferred) or `statusCode`. 5xx is not passed through so handler bugs stay 500.
 */
function numericClientErrorStatus(err: unknown): number | undefined {
    const errObj = err as { status?: unknown; statusCode?: unknown }
    const fromStatus = typeof errObj.status === "number" ? errObj.status : undefined
    const fromStatusCode = typeof errObj.statusCode === "number" ? errObj.statusCode : undefined
    const preferredStatus =
        fromStatus !== undefined
            ? fromStatus
            : fromStatusCode !== undefined
              ? fromStatusCode
              : undefined
    if (
        preferredStatus !== undefined &&
        Number.isFinite(preferredStatus) &&
        preferredStatus >= 400 &&
        preferredStatus < 500
    ) {
        return Math.floor(preferredStatus)
    }
    return undefined
}

/**
 * Maps unhandled Express errors to a safe JSON status/body for every bot API route.
 * Parse errors stay 400, an unready bot stays 503, numeric 4xx stay 4xx, everything else is 500
 * without leaking the raw exception into the response body.
 */
export function classifyBotApiErrorResponse(err: unknown): BotApiClassifiedError {
    if (isExpressJsonParseError(err)) {
        return {
            status: 400,
            body: {
                ok: false,
                error: {
                    error: "Malformed JSON",
                    details: sanitizeBotApiError(err).message,
                },
            },
        }
    }
    if (err instanceof BotClientNotInitializedError) {
        return {
            status: 503,
            body: {
                ok: false,
                error: {
                    error: "Bot is not ready",
                    details: err.message,
                },
            },
        }
    }
    const numericClientError = numericClientErrorStatus(err)
    if (numericClientError !== undefined) {
        const details = sanitizeBotApiError(err).message || "Bad request"
        return {
            status: numericClientError,
            body: {
                ok: false,
                error: { error: "Request error", details },
            },
        }
    }
    return {
        status: 500,
        body: { ok: false, error: { error: "Internal server error" } },
    }
}
