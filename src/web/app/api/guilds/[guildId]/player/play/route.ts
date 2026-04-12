import { NextResponse } from "next/server"
import { proxyBotApi } from "@/server/bot-api-proxy"

export async function POST(request: Request) {
    try {
        return await proxyBotApi(request)
    } catch (error: unknown) {
        console.error("[api/guilds/.../player/play] proxy failed", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
