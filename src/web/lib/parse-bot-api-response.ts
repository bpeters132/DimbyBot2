import type { ApiResponse } from "../../types/web.js"

export type BotApiActionOk<T> = { ok: true; data: T }
export type BotApiActionErr = { ok: false; error: string }
export type BotApiActionResult<T> = BotApiActionOk<T> | BotApiActionErr

/**
 * Parses a bot API `Response` into the dashboard action result shape.
 * Fail-closed on empty bodies, invalid JSON, HTTP errors, and success payloads missing `data`.
 */
export async function parseBotApiActionResponse<T>(
    res: Response
): Promise<BotApiActionResult<T>> {
    const text = await res.text()
    if (!text.trim()) {
        return {
            ok: false,
            error: res.ok
                ? "Empty response from bot API."
                : `Request failed (${res.status}): empty body.`,
        }
    }
    let payload: ApiResponse<T>
    try {
        payload = JSON.parse(text) as ApiResponse<T>
    } catch {
        return {
            ok: false,
            error: res.ok
                ? "Invalid JSON from bot API."
                : `Request failed (${res.status}): invalid JSON.`,
        }
    }
    if (!res.ok) {
        if (payload.ok === false && payload.error && typeof payload.error === "object") {
            const errObj = payload.error as { error?: string; details?: string }
            const msg =
                [errObj.details, errObj.error].filter(Boolean).join(" — ") ||
                `Request failed (${res.status}).`
            return { ok: false, error: msg }
        }
        return { ok: false, error: `Request failed (${res.status}).` }
    }
    if (payload.ok === false) {
        const err: unknown = payload.error
        if (err != null && typeof err === "object") {
            const errObj = err as { error?: string; details?: string }
            const msg =
                [errObj.details, errObj.error].filter(Boolean).join(" — ") ||
                "Bot API returned an error."
            return { ok: false, error: msg }
        }
        if (typeof err === "string" && err.trim()) {
            return { ok: false, error: err.trim() }
        }
        return { ok: false, error: "Bot API returned an error." }
    }
    if (payload.data === undefined || payload.data === null) {
        return { ok: false, error: "Bot API returned success without data." }
    }
    return { ok: true, data: payload.data }
}
