import { NextResponse } from "next/server"
import { guardGuildAccess } from "@/lib/guild-api-route-guard"
import { proxyBotApi } from "@/server/bot-api-proxy"

/**
 * Uses a Route Handler (not a server action) so the inbound browser {@link Request} — method,
 * body, and cookie headers — is passed through to {@link proxyBotApi} unchanged for the bot’s
 * Express `/api/guilds/.../player/play` endpoint.
 */
export async function POST(
    request: Request,
    ctx: { params: Promise<{ guildId: string }> }
): Promise<Response> {
    const { guildId } = await ctx.params
    const denied = await guardGuildAccess(guildId)
    if (denied) return denied
    try {
        return await proxyBotApi(request)
    } catch (error: unknown) {
        console.error("[api/guilds/.../player/play] proxy failed", error)
        const details =
            error instanceof Error
                ? error.message
                : typeof error === "string"
                  ? error
                  : JSON.stringify(error)
        return NextResponse.json(
            {
                ok: false,
                error: {
                    error: "Internal Server Error",
                    details,
                },
            },
            { status: 500 }
        )
    }
}
