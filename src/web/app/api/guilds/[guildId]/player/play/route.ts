import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { resolveAuthenticatedGuildAccess } from "@/lib/api-auth"
import { proxyBotApi } from "@/server/bot-api-proxy"

async function guardGuildAccess(guildId: string): Promise<NextResponse | null> {
    try {
        const h = await headers()
        const headerRecord: Record<string, string> = {}
        for (const [k, v] of h.entries()) {
            headerRecord[k] = v
        }
        const ctx = await resolveAuthenticatedGuildAccess(headerRecord, guildId)
        if (ctx.ok === false) {
            return NextResponse.json(
                { ok: false, error: { error: ctx.error, details: ctx.details } },
                { status: ctx.status }
            )
        }
        return null
    } catch {
        return NextResponse.json(
            {
                ok: false,
                error: {
                    error: "internal_error",
                    details: "authentication failed",
                },
            },
            { status: 500 }
        )
    }
}

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
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
