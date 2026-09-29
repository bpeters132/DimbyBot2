import { NextResponse } from "next/server"
import { resolvedBotApiPort } from "../../../../lib/botApiPortEnv.js"
import { resolvePublicPlayerWsConfigUrl } from "@/shared/player-ws-url.js"

/**
 * **Public by design:** `GET` returns only a non-sensitive WebSocket URL string (or null) so the
 * browser can connect to the player socket before any guild-scoped auth runs; no secrets or user
 * data are exposed, so this route intentionally skips session checks.
 *
 * Prefer `WEBSOCKET_CLIENT_URL` (runtime env, not inlined into the client bundle).
 * Falls back to `NEXT_PUBLIC_WS_URL` when set in the server environment for legacy setups.
 * In `NODE_ENV=development`, when neither is set, uses `BOT_API_PORT` for `ws://localhost:{port}/ws`.
 */
export function GET(): NextResponse {
    const isDev = process.env.NODE_ENV === "development"
    const raw =
        process.env.WEBSOCKET_CLIENT_URL?.trim() || process.env.NEXT_PUBLIC_WS_URL?.trim() || ""
    const wsUrl = resolvePublicPlayerWsConfigUrl({
        configuredUrl: raw,
        isDev,
        devFallbackPort: resolvedBotApiPort(),
    })
    return NextResponse.json({ wsUrl })
}
