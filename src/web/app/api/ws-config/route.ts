import { NextResponse } from "next/server"

/**
 * **Public by design:** `GET` returns only a non-sensitive WebSocket URL string (or null) so the
 * browser can connect to the player socket before any guild-scoped auth runs; no secrets or user
 * data are exposed, so this route intentionally skips session checks.
 *
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
        if (u.username || u.password) {
            return NextResponse.json({ wsUrl: null as string | null })
        }
        return NextResponse.json({ wsUrl: u.toString() })
    } catch {
        return NextResponse.json({ wsUrl: null as string | null })
    }
}
