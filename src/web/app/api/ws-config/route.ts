import { NextResponse } from "next/server"

/**
 * Returns an optional absolute WebSocket URL for the player socket.
 * Prefer `WEBSOCKET_CLIENT_URL` (runtime env, not inlined into the client bundle).
 * Falls back to `NEXT_PUBLIC_WS_URL` when set in the server environment for legacy setups.
 */
export function GET(): NextResponse {
    const raw =
        process.env.WEBSOCKET_CLIENT_URL?.trim() || process.env.NEXT_PUBLIC_WS_URL?.trim() || ""
    if (!raw) {
        return NextResponse.json({ wsUrl: null as string | null })
    }
    try {
        const u = new URL(raw)
        if (u.protocol !== "ws:" && u.protocol !== "wss:") {
            return NextResponse.json({ wsUrl: null as string | null })
        }
        return NextResponse.json({ wsUrl: u.toString() })
    } catch {
        return NextResponse.json({ wsUrl: null as string | null })
    }
}
