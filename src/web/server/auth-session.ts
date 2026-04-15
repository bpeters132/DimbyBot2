import { randomUUID } from "crypto"
import { headers } from "next/headers"
import { auth, type BetterAuthSession } from "@/auth"
import { sanitizeErrorText } from "@/lib/sanitize-log-text.js"

export type SessionReadSuccess = {
    ok: true
    session: BetterAuthSession | null
}

/** Coarse failure bucket for UI hints (derived from error text only; no secrets). */
export type SessionReadFailureKind =
    | "database_connectivity"
    | "database_schema"
    | "auth_configuration"
    | "unknown"

export type SessionReadFailure = {
    ok: false
    message: string
    correlationId: string
    failureKind: SessionReadFailureKind
}

export type SessionReadResult = SessionReadSuccess | SessionReadFailure

function classifyAuthSessionFailure(rawMessage: string): SessionReadFailureKind {
    const m = rawMessage.toLowerCase()
    if (
        /\bp1001\b/i.test(rawMessage) ||
        /\beconnrefused\b/i.test(rawMessage) ||
        m.includes("can't reach database server") ||
        m.includes("cannot reach database") ||
        m.includes("connection refused") ||
        m.includes("connect econnrefused") ||
        m.includes("econnreset") ||
        m.includes("etimedout") ||
        m.includes("timeout") ||
        /\benotfound\b/i.test(rawMessage)
    ) {
        return "database_connectivity"
    }
    if (
        m.includes("does not exist") ||
        m.includes("relation ") ||
        /\bp2021\b/i.test(rawMessage) ||
        m.includes("unknown table") ||
        m.includes("no such table")
    ) {
        return "database_schema"
    }
    if (
        m.includes("decrypt") ||
        m.includes("jwe") ||
        (m.includes("jwt") && m.includes("invalid")) ||
        m.includes("invalid signing key") ||
        m.includes("session token")
    ) {
        return "auth_configuration"
    }
    return "unknown"
}

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
        const failureKind = classifyAuthSessionFailure(rawMessage)
        const safeMsg = sanitizeErrorText(rawMessage, 800)
        // One line so `docker logs ... | grep correlationId` works across drivers.
        console.error(
            `[auth-session] failed correlationId=${correlationId} failureKind=${failureKind} name=${name} message=${safeMsg}`
        )
        return { ok: false, message: "Failed to load session", correlationId, failureKind }
    }
}
