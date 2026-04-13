import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { AuthenticatedSession } from "@/lib/api-auth"
import { proxyBotApi } from "@/server/bot-api-proxy"

/**
 * `GET` must proxy to the external bot process via `proxyBotApi` and `API_PROXY_TARGET`; this Next
 * route cannot call a local server action or import `src/botApi` directly because Turbopack/runtime
 * boundaries keep the bot API in a separate long-running process.
 */
export async function GET(request: Request) {
    let session: AuthenticatedSession | null
    try {
        session = (await auth.api.getSession({
            headers: await headers(),
        })) as AuthenticatedSession | null
    } catch (err: unknown) {
        const status =
            typeof err === "object" && err !== null && "status" in err
                ? (err as { status?: unknown }).status
                : undefined
        const statusCode =
            typeof err === "object" && err !== null && "statusCode" in err
                ? (err as { statusCode?: unknown }).statusCode
                : undefined
        const numericStatus = typeof status === "number" ? status : statusCode
        if (numericStatus === 401 || numericStatus === 403) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        console.error("[api/guilds] auth session lookup failed", err)
        return NextResponse.json({ error: "Auth service unavailable" }, { status: 502 })
    }

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        return await proxyBotApi(request)
    } catch (error: unknown) {
        console.error("[api/guilds] GET proxy failed", error)
        return NextResponse.json({ error: "Bot API temporarily unavailable" }, { status: 503 })
    }
}
