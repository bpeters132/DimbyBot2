/**
 * Proxies queue index mutations to the bot API with the caller’s cookies — preserves raw HTTP
 * (PATCH/DELETE bodies) and a single trusted hop from Next to the bot process.
 */
import { guardGuildAccess } from "@/lib/guild-api-route-guard"
import { proxyBotApi } from "@/server/bot-api-proxy"

export async function DELETE(
    request: Request,
    ctx: { params: Promise<{ guildId: string }> }
): Promise<Response> {
    const { guildId } = await ctx.params
    const denied = await guardGuildAccess(guildId)
    if (denied) return denied
    return proxyBotApi(request)
}

export async function PATCH(
    request: Request,
    ctx: { params: Promise<{ guildId: string }> }
): Promise<Response> {
    const { guildId } = await ctx.params
    const denied = await guardGuildAccess(guildId)
    if (denied) return denied
    return proxyBotApi(request)
}
