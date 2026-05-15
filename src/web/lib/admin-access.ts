import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { AuthenticatedSession } from "@/lib/api-auth"
import { resolveDiscordUserSnowflake } from "../../shared/discord-user-id.js"
import { getCachedOwnerId } from "../../shared/permissions.js"

export type AdminAccessResult =
    | { ok: true; session: AuthenticatedSession; discordUserId: string }
    | { ok: false; status: number; error: string; details?: string }

/**
 * Validates the Better Auth session and restricts access to the bot owner (`OWNER_ID`).
 */
export async function resolveAdminAccess(reqHeaders: Headers): Promise<AdminAccessResult> {
    let session: AuthenticatedSession | null
    try {
        session = (await auth.api.getSession({
            headers: reqHeaders,
        })) as AuthenticatedSession | null
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error("[admin-access] getSession failed:", message)
        return {
            ok: false,
            status: 503,
            error: "Service Unavailable",
            details: "Could not load your session. Please try again later.",
        }
    }

    if (!session?.user?.id) {
        return { ok: false, status: 401, error: "Unauthorized" }
    }

    let discordUserId: string | null
    try {
        discordUserId = await resolveDiscordUserSnowflake(session.user.id, reqHeaders)
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[admin-access] resolveDiscordUserSnowflake failed:", msg)
        return {
            ok: false,
            status: 403,
            error: "Discord account required",
            details: "Sign in with Discord, or sign out and sign in again.",
        }
    }
    if (!discordUserId) {
        return {
            ok: false,
            status: 403,
            error: "Discord account required",
            details:
                "We could not resolve your Discord user id. Sign in with Discord, or sign out and sign in again.",
        }
    }

    const ownerId = getCachedOwnerId()
    if (!ownerId || discordUserId !== ownerId) {
        return {
            ok: false,
            status: 403,
            error: "Forbidden",
            details: "Developer access required.",
        }
    }

    return { ok: true, session, discordUserId }
}

/** Returns a JSON error response when access is denied; `null` when the caller may proceed. */
export async function guardAdminAccess(): Promise<NextResponse | null> {
    try {
        const h = await headers()
        const headerRecord = new Headers(h)
        const result = await resolveAdminAccess(headerRecord)
        if (result.ok === false) {
            return NextResponse.json(
                { ok: false, error: result.error, details: result.details },
                { status: result.status }
            )
        }
        return null
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error("[admin-access] guardAdminAccess failed:", message)
        return NextResponse.json(
            { ok: false, error: "Internal error", details: { code: "INTERNAL_ERROR" } },
            { status: 500 }
        )
    }
}
