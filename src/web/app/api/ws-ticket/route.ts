import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { AuthenticatedSession } from "@/lib/api-auth"
import { createWsConnectToken } from "@/lib/ws-connect-token"

/**
 * Issues a short-lived HMAC token for opening `ws://…/ws` on the bot port (different origin than Next),
 * where the browser does not send Better Auth session cookies.
 */
export async function GET(): Promise<NextResponse> {
    const secret = process.env.BETTER_AUTH_SECRET
    if (!secret) {
        console.error(
            "[api/ws-ticket] server misconfigured: BETTER_AUTH_SECRET is missing (set in src/web/.env or environment)"
        )
        return NextResponse.json({ error: "Server misconfigured" }, { status: 503 })
    }

    try {
        const session = (await auth.api.getSession({
            headers: await headers(),
        })) as AuthenticatedSession | null

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const token = createWsConnectToken(session.user.id, secret, 60)
        return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "unknown"
        console.error("[api/ws-ticket] failed to resolve session:", message)
        return NextResponse.json({ error: "Auth service temporarily unavailable" }, { status: 503 })
    }
}
