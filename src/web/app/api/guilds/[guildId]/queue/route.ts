/**
 * Proxies raw HTTP (method, body, query) to the bot’s Express API. Server actions cannot forward the
 * original Request this way, so this route must exist. Guild access is checked here; the bot repeats
 * permission checks with the forwarded session cookie.
 */
import { guardGuildAccess } from "@/lib/guild-api-route-guard"
import { proxyBotApi } from "@/server/bot-api-proxy"

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
