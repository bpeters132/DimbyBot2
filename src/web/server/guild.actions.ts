"use server"

import type { ApiResponse, GuildListResponse } from "@/types/web"
import { writeAuditLog } from "@/lib/audit-log"
import { serverFetchBot } from "@/server/fetch-bot-api"

export type GuildListActionResult =
    | { ok: true; data: GuildListResponse }
    | { ok: false; error: string }

function sanitizeAuditError(error: unknown): Record<string, string> {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack?.slice(0, 800) ?? "",
        }
    }
    return { message: String(error) }
}

async function parseGuildListBotResponse(res: Response): Promise<GuildListActionResult> {
    const text = await res.text()
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

    if (!res.ok || typedPayload.ok === false) {
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

/**
 * Loads mutual guilds via the bot API (cookies forwarded). Prefer calling this from the dashboard
 * RSC so the list is not fetched twice from the client (Strict Mode / prefetch can race and show
 * a 429 error after a successful load).
 */
export async function loadGuildListForDashboard(): Promise<GuildListActionResult> {
    try {
        const res = await serverFetchBot("/api/guilds")
        return parseGuildListBotResponse(res)
    } catch (error: unknown) {
        writeAuditLog("error", "GUILD_LIST_LOAD_FAILED", "loadGuildListForDashboard failed", {
            action: "LOAD_GUILD_LIST_FOR_DASHBOARD",
            category: "guild",
            source: "guild.actions",
            outcome: "failure",
            error: sanitizeAuditError(error),
        })
        return {
            ok: false,
            error: "Unable to fetch bot data.",
        }
    }
}

/** Same as {@link loadGuildListForDashboard}; use when invoking from a client as a server action. */
export async function getGuildListAction(): Promise<GuildListActionResult> {
    return loadGuildListForDashboard()
}
