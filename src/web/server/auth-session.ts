import { headers } from "next/headers"
import { auth } from "@/auth"

export type SessionReadSuccess = {
    ok: true
    session: { user?: { id?: string; name?: string; image?: string } } | null
}

export type SessionReadFailure = {
    ok: false
    message: string
    code?: string
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
        })) as { user?: { id?: string; name?: string; image?: string } } | null
        return { ok: true, session }
    } catch (e) {
        const message =
            e instanceof Error ? e.message : typeof e === "string" ? e : "Failed to load session"
        const code =
            typeof e === "object" && e !== null && "code" in e
                ? String((e as { code?: unknown }).code)
                : undefined
        return { ok: false, message, code }
    }
}
