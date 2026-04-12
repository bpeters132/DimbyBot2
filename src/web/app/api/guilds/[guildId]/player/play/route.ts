import { NextResponse } from "next/server"
import { proxyBotApi } from "@/server/bot-api-proxy"

/**
 * Uses a Route Handler (not a server action) so the inbound browser {@link Request} — method,
 * body, and cookie headers — is passed through to {@link proxyBotApi} unchanged for the bot’s
 * Express `/api/guilds/.../player/play` endpoint.
 */
export async function POST(request: Request) {
    try {
        return await proxyBotApi(request)
    } catch (error: unknown) {
        console.error("[api/guilds/.../player/play] proxy failed", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
