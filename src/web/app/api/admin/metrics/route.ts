import { NextResponse } from "next/server"
import { guardAdminAccess } from "@/lib/admin-access.js"
import { proxyBotApi } from "@/server/bot-api-proxy.js"

export async function GET(request: Request): Promise<Response> {
    try {
        const denied = await guardAdminAccess()
        if (denied) return denied
        return await proxyBotApi(request)
    } catch (error: unknown) {
        const safeMessage = (error instanceof Error ? error.message : String(error)).slice(0, 500)
        console.error(`[api/admin/metrics] GET proxy failed: ${safeMessage}`)
        return NextResponse.json(
            {
                ok: false,
                error: {
                    error: safeMessage,
                    details: "PROXY_ERROR",
                },
            },
            { status: 500 }
        )
    }
}
