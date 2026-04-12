/**
 * Proxies queue index mutations to the bot API with the caller’s cookies — preserves raw HTTP
 * (PATCH/DELETE bodies) and a single trusted hop from Next to the bot process.
 */
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
    } catch (err: unknown) {
        console.error("[api/guilds/.../queue/[index]] guardGuildAccess failed", err)
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
