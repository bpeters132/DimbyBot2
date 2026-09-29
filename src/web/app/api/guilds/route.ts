import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { AuthenticatedSession } from "@/lib/api-auth"
import { mapGuildsRouteAuthLookupFailure } from "@/lib/guilds-route-auth-failure"
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
        const mapped = mapGuildsRouteAuthLookupFailure(err)
        if (mapped.status === 401) {
            return NextResponse.json(mapped.body, { status: mapped.status })
        }
        const safeMessage = err instanceof Error ? err.message.slice(0, 500) : "unknown"
        console.error("[api/guilds] auth session lookup failed", {
            name: err instanceof Error ? err.name : typeof err,
            message: safeMessage,
            numericStatus: mapped.lookupStatus,
        })
        return NextResponse.json(mapped.body, { status: mapped.status })
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
