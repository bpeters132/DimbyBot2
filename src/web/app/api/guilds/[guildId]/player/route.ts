/**
 * Forwards the browser’s cookies to the bot’s Express `/api/guilds/...` so the session is validated
 * on the bot. Keeps a stable HTTP proxy boundary (method/body/query) that server actions do not replace.
 */
import { NextResponse } from "next/server"
import { guardGuildAccess } from "@/lib/guild-api-route-guard"
import { proxyBotApi } from "@/server/bot-api-proxy"

export async function GET(
    request: Request,
    ctx: { params: Promise<{ guildId: string }> }
): Promise<Response> {
    try {
        const { guildId } = await ctx.params
        const denied = await guardGuildAccess(guildId)
        if (denied) return denied
        return await proxyBotApi(request)
    } catch (error: unknown) {
        console.error("[api/guilds/.../player] GET proxy failed", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}

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
        console.error("[api/guilds/.../player] POST proxy failed", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
