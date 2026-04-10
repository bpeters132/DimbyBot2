"use server"

import type { ApiResponse, GuildListResponse } from "@/types/web"
import { serverFetchBot } from "@/server/fetch-bot-api"

export type GuildListActionResult =
    | { ok: true; data: GuildListResponse }
    | { ok: false; error: string }

async function parseGuildListBotResponse(res: Response): Promise<GuildListActionResult> {
    const text = await res.text()
    if (!text.trim()) {
        return { ok: false, error: "Empty response from bot API (is the bot running on WEB_PORT?)" }
    }

    let payload: ApiResponse<GuildListResponse>
    try {
        payload = JSON.parse(text) as ApiResponse<GuildListResponse>
    } catch {
        return {
            ok: false,
            error: "Bot API returned invalid JSON (proxy error or HTML error page).",
        }
    }

    if (!res.ok || payload.ok === false) {
        const msg =
            payload.ok === false
                ? [payload.error.error, payload.error.details].filter(Boolean).join(" — ")
                : "Failed to load guilds."
        return { ok: false, error: msg }
    }

    return { ok: true, data: payload.data }
}

/**
 * Loads mutual guilds via the bot API (cookies forwarded). Prefer calling this from the dashboard
 * RSC so the list is not fetched twice from the client (Strict Mode / prefetch can race and show
 * a 429 error after a successful load).
 */
export async function loadGuildListForDashboard(): Promise<GuildListActionResult> {
    const res = await serverFetchBot("/api/guilds")
    return parseGuildListBotResponse(res)
}

/** Same as {@link loadGuildListForDashboard}; use when invoking from a client as a server action. */
export async function getGuildListAction(): Promise<GuildListActionResult> {
    return loadGuildListForDashboard()
}
