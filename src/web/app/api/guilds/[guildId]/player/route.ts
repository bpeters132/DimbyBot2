/**
 * Forwards the browser’s cookies to the bot’s Express `/api/guilds/...` so the session is validated
 * on the bot. Keeps a stable HTTP proxy boundary (method/body/query) that server actions do not replace.
 */
import { NextResponse } from "next/server"
import { proxyBotApi } from "@/server/bot-api-proxy"

export async function GET(request: Request) {
    try {
        return await proxyBotApi(request)
    } catch (error: unknown) {
        console.error("[api/guilds/.../player] GET proxy failed", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        return await proxyBotApi(request)
    } catch (error: unknown) {
        console.error("[api/guilds/.../player] POST proxy failed", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
