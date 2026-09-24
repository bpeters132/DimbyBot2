import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { AuthenticatedSession } from "@/lib/api-auth"
import { createWsConnectToken } from "@/lib/ws-connect-token"
import { mapWsTicketAuthFailure, type WsTicketAuthFailureKind } from "@/lib/ws-ticket-auth-failure"

const noStore = { "Cache-Control": "no-store" }

function ticketAuthFailureResponse(kind: WsTicketAuthFailureKind): NextResponse {
    const failure = mapWsTicketAuthFailure(kind)
    return NextResponse.json(failure.body, { status: failure.status, headers: noStore })
}

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
        return ticketAuthFailureResponse("missing_secret")
    }

    try {
        const session = (await auth.api.getSession({
            headers: await headers(),
        })) as AuthenticatedSession | null

        if (!session?.user?.id) {
            return ticketAuthFailureResponse("unauthorized")
        }

        const token = createWsConnectToken(session.user.id, secret, 60)
        return NextResponse.json({ token }, { headers: noStore })
    } catch (error: unknown) {
        const errName = error instanceof Error ? error.name : typeof error
        console.error("[api/ws-ticket] session resolution failed", { errName })
        return ticketAuthFailureResponse("auth_unavailable")
    }
}
