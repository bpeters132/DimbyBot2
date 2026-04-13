import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { resolveAuthenticatedGuildAccess } from "@/lib/api-auth"
import { sanitizeErrorText } from "@/lib/sanitize-log-text"

/** Next route helper: forwards request headers and returns a JSON error response when access fails. */
export async function guardGuildAccess(guildId: string): Promise<NextResponse | null> {
    try {
        const h = await headers()
        const headerRecord = Object.fromEntries(h.entries()) as Record<string, string>
        const ctx = await resolveAuthenticatedGuildAccess(headerRecord, guildId)
        if (ctx.ok === false) {
            return NextResponse.json(
                { ok: false, status: ctx.status, error: ctx.error, details: ctx.details },
                { status: ctx.status }
            )
        }
        return null
    } catch (err: unknown) {
        const name = err instanceof Error ? err.name : "Error"
        const message =
            err instanceof Error ? sanitizeErrorText(err.message, 200) : "[REDACTED_UNKNOWN_ERROR]"
        console.error("[guild-api-route-guard] guardGuildAccess failed", `${name}: ${message}`)
        return NextResponse.json(
            {
                ok: false,
                status: 500,
                error: "Internal error",
                details: { code: "INTERNAL_ERROR" },
            },
            { status: 500 }
        )
    }
}
