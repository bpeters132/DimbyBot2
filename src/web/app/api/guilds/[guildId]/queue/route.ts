/**
 * Proxies raw HTTP (method, body, query) to the bot’s Express API. Server actions cannot forward the
 * original Request this way, so this route must exist. Guild access is checked here; the bot repeats
 * permission checks with the forwarded session cookie.
 */
import { NextResponse } from "next/server"
import { guardGuildAccess } from "@/lib/guild-api-route-guard"
import { proxyBotApi } from "@/server/bot-api-proxy"

export async function GET(request: Request, ctx: { params: Promise<{ guildId: string }> }) {
    try {
        const { guildId } = await ctx.params
        const denied = await guardGuildAccess(guildId)
        if (denied) return denied
        return await proxyBotApi(request)
    } catch (error: unknown) {
        console.error("[api/guilds/.../queue] GET proxy failed", error)
        return NextResponse.json(
            { ok: false, error: "Internal Server Error", details: { code: "INTERNAL_ERROR" } },
            { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
        )
    }
}

export async function POST(request: Request, ctx: { params: Promise<{ guildId: string }> }) {
    try {
        const { guildId } = await ctx.params
        const denied = await guardGuildAccess(guildId)
        if (denied) return denied
        return await proxyBotApi(request)
    } catch (error: unknown) {
        console.error("[api/guilds/.../queue] POST proxy failed", error)
        return NextResponse.json(
            { ok: false, error: "Internal Server Error", details: { code: "INTERNAL_ERROR" } },
            { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
        )
    }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ guildId: string }> }) {
    try {
        const { guildId } = await ctx.params
        const denied = await guardGuildAccess(guildId)
        if (denied) return denied
        return await proxyBotApi(request)
    } catch (error: unknown) {
        console.error("[api/guilds/.../queue] DELETE proxy failed", error)
        return NextResponse.json(
            { ok: false, error: "Internal Server Error", details: { code: "INTERNAL_ERROR" } },
            { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
        )
    }
}
