import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { AuthenticatedSession } from "@/lib/api-auth"
import { proxyBotApi } from "@/server/bot-api-proxy"

export async function GET(request: Request) {
    let session: AuthenticatedSession | null
    try {
        session = (await auth.api.getSession({
            headers: await headers(),
        })) as AuthenticatedSession | null
    } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        return await proxyBotApi(request)
    } catch (error: unknown) {
        console.error("[api/guilds/voice-context] GET proxy failed", error)
        return NextResponse.json({ error: "Bot API temporarily unavailable" }, { status: 503 })
    }
}
