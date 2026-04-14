import { randomUUID } from "crypto"
import { headers } from "next/headers"
import { auth, type BetterAuthSession } from "@/auth"
import { sanitizeErrorText } from "@/lib/sanitize-log-text.js"

export type SessionReadSuccess = {
    ok: true
    session: BetterAuthSession | null
}

export type SessionReadFailure = {
    ok: false
    message: string
    correlationId: string
}

export type SessionReadResult = SessionReadSuccess | SessionReadFailure

/**
 * Loads the Better Auth session without throwing when the database or auth layer is unreachable.
 * Use this in server layouts/pages so a down Postgres does not take down the whole route.
 */
export async function readSessionSafe(): Promise<SessionReadResult> {
    try {
        const session = (await auth.api.getSession({
            headers: await headers(),
        })) as BetterAuthSession | null
        return { ok: true, session }
    } catch (e: unknown) {
        const correlationId = randomUUID()
        const name = e instanceof Error ? e.name : "Error"
        const rawMessage = e instanceof Error ? e.message : String(e)
        console.error("[auth-session] failed to load session", {
            correlationId,
            name,
            message: sanitizeErrorText(rawMessage, 800),
        })
        return { ok: false, message: "Failed to load session", correlationId }
    }
}
