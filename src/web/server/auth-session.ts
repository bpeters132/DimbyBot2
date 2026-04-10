import { headers } from "next/headers"
import { auth, type BetterAuthSession } from "@/auth"

export type SessionReadSuccess = {
    ok: true
    session: BetterAuthSession | null
}

export type SessionReadFailure = {
    ok: false
    message: string
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
    } catch (e) {
        console.error("[auth-session] failed to load session", e)
        return { ok: false, message: "Failed to load session" }
    }
}
