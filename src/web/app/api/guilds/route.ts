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
    try {
        const session = (await auth.api.getSession({
            headers: await headers(),
        })) as AuthenticatedSession | null
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        return proxyBotApi(request)
    } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
}
