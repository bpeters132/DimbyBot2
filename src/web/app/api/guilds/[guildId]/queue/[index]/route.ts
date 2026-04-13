/**
 * Proxies queue index mutations to the bot API with the caller’s cookies — preserves raw HTTP
 * (PATCH/DELETE bodies) and a single trusted hop from Next to the bot process.
 */
import { NextResponse } from "next/server"
import { guardGuildAccess } from "@/lib/guild-api-route-guard"
import { proxyBotApi } from "@/server/bot-api-proxy"

export async function DELETE(
    request: Request,
    ctx: { params: Promise<{ guildId: string }> }
): Promise<Response> {
    const { guildId } = await ctx.params
    const denied = await guardGuildAccess(guildId)
    if (denied) return denied
    try {
        return await proxyBotApi(request)
    } catch (error: unknown) {
        console.error("[api/guilds/.../queue/[index]] DELETE proxy failed", error)
        return NextResponse.json(
            {
                ok: false,
                error: "Internal Server Error",
                details: { code: "INTERNAL_ERROR" },
            },
            { status: 500 }
        )
    }
}

export async function PATCH(
    request: Request,
    ctx: { params: Promise<{ guildId: string }> }
): Promise<Response> {
    const { guildId } = await ctx.params
    const denied = await guardGuildAccess(guildId)
    if (denied) return denied
    try {
        return await proxyBotApi(request)
    } catch (error: unknown) {
        console.error("[api/guilds/.../queue/[index]] PATCH proxy failed", error)
        return NextResponse.json(
            {
                ok: false,
                error: "Internal Server Error",
                details: { code: "INTERNAL_ERROR" },
            },
            { status: 500 }
        )
    }
}
