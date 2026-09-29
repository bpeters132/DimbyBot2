import type { ApiResponse, GuildListResponse } from "../../types/web.js"

export type GuildListActionResult =
    | { ok: true; data: GuildListResponse }
    | { ok: false; error: string }

/**
 * Fail-closed parse of `GET /api/guilds` for the dashboard server list.
 * Empty bodies, HTML/proxy pages, missing `ok`, HTTP errors, and success without `data` must not
 * render as an empty guild list.
 */
export function parseGuildListBotPayload(httpOk: boolean, text: string): GuildListActionResult {
    if (!text.trim()) {
        return {
            ok: false,
            error: "Empty response from bot API (is the bot running on BOT_API_PORT?)",
        }
    }

    let payload: unknown
    try {
        payload = JSON.parse(text)
    } catch {
        return {
            ok: false,
            error: "Bot API returned invalid JSON (proxy error or HTML error page).",
        }
    }

    if (
        !payload ||
        typeof payload !== "object" ||
        typeof (payload as { ok?: unknown }).ok !== "boolean"
    ) {
        return {
            ok: false,
            error: "Bot API returned an unexpected response shape.",
        }
    }

    const typedPayload = payload as ApiResponse<GuildListResponse>

    if (!httpOk || typedPayload.ok === false) {
        const errorPayload =
            typedPayload.ok === false &&
            typedPayload.error &&
            typeof typedPayload.error === "object"
                ? typedPayload.error
                : null
        const baseError =
            errorPayload && typeof errorPayload.error === "string"
                ? errorPayload.error
                : "Failed to load guilds."
        const details =
            errorPayload && typeof errorPayload.details === "string"
                ? errorPayload.details
                : undefined
        const msg =
            typedPayload.ok === false ? [baseError, details].filter(Boolean).join(" — ") : baseError
        return { ok: false, error: msg }
    }

    if (typedPayload.data === undefined || typedPayload.data === null) {
        return {
            ok: false,
            error: "Bot API returned success without guild list data.",
        }
    }

    return { ok: true, data: typedPayload.data }
}

/** Reads the body then applies {@link parseGuildListBotPayload}. */
export async function parseGuildListBotResponse(res: Response): Promise<GuildListActionResult> {
    return parseGuildListBotPayload(res.ok, await res.text())
}
