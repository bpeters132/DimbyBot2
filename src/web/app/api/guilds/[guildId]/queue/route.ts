/**
 * Proxies raw HTTP (method, body, query) to the bot’s Express API. Server actions cannot forward the
 * original Request this way, so this route must exist. Guild access is checked here; the bot repeats
 * permission checks with the forwarded session cookie.
 */
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { resolveAuthenticatedGuildAccess } from "@/lib/api-auth"
import { proxyBotApi } from "@/server/bot-api-proxy"

async function guardGuildAccess(guildId: string): Promise<NextResponse | null> {
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
}

export async function GET(request: Request, ctx: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await ctx.params
    const denied = await guardGuildAccess(guildId)
    if (denied) return denied
    return proxyBotApi(request)
}

export async function POST(request: Request, ctx: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await ctx.params
    const denied = await guardGuildAccess(guildId)
    if (denied) return denied
    return proxyBotApi(request)
}

export async function DELETE(request: Request, ctx: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await ctx.params
    const denied = await guardGuildAccess(guildId)
    if (denied) return denied
    return proxyBotApi(request)
}
