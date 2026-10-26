import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { resolveAuthenticatedGuildAccess } from "@/lib/api-auth"
import {
    mapGuildApiRouteGuardAccessDenied,
    mapGuildApiRouteGuardUnexpectedFailure,
} from "@/lib/guild-api-route-guard-failure"
import { sanitizeErrorText } from "@/lib/sanitize-log-text"

/** Next route helper: forwards request headers and returns a JSON error response when access fails. */
export async function guardGuildAccess(guildId: string): Promise<NextResponse | null> {
    try {
        const h = await headers()
        const headerRecord = Object.fromEntries(h.entries()) as Record<string, string>
        const ctx = await resolveAuthenticatedGuildAccess(headerRecord, guildId)
        if (ctx.ok === false) {
            const mapped = mapGuildApiRouteGuardAccessDenied(ctx)
            return NextResponse.json(mapped.body, { status: mapped.status })
        }
        return null
    } catch (err: unknown) {
        const name = err instanceof Error ? err.name : "Error"
        const message =
            err instanceof Error ? sanitizeErrorText(err.message, 200) : "[REDACTED_UNKNOWN_ERROR]"
        console.error("[guild-api-route-guard] guardGuildAccess failed", `${name}: ${message}`)
        const mapped = mapGuildApiRouteGuardUnexpectedFailure()
        return NextResponse.json(mapped.body, { status: mapped.status })
    }
}
