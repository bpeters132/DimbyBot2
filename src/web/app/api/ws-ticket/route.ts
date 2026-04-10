import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { createWsConnectToken } from "@/lib/ws-connect-token"

/**
 * Issues a short-lived HMAC token for opening `ws://…/ws` on the bot port (different origin than Next),
 * where the browser does not send Better Auth session cookies.
 */
export async function GET(): Promise<NextResponse> {
    const secret = process.env.BETTER_AUTH_SECRET
    if (!secret) {
        return NextResponse.json({ error: "BETTER_AUTH_SECRET is not set" }, { status: 503 })
    }

    let session: { user?: { id?: string } } | null = null
    try {
        session = (await auth.api.getSession({
            headers: await headers(),
        })) as { user?: { id?: string } } | null
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "unknown"
        console.error("[api/ws-ticket] failed to resolve session:", message)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = createWsConnectToken(session.user.id, secret)
    return NextResponse.json(
        { token },
        { headers: { "Cache-Control": "no-store" } }
    )
}
