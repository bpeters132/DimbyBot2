"use server"

import { writeAuditLog } from "@/lib/audit-log"
import {
    parseGuildListBotResponse,
    type GuildListActionResult,
} from "@/lib/parse-guild-list-response"
import { serverFetchBot } from "@/server/fetch-bot-api"

export type { GuildListActionResult }

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
