import { NextResponse } from "next/server"
import { guardAdminAccess } from "@/lib/admin-access"
import { proxyBotApi } from "@/server/bot-api-proxy"

export async function POST(request: Request): Promise<Response> {
    try {
        const denied = await guardAdminAccess()
        if (denied) return denied
        return await proxyBotApi(request)
    } catch (error: unknown) {
        const safeMessage = (error instanceof Error ? error.message : String(error)).slice(0, 500)
        console.error(`[api/admin/database/cleanup] POST proxy failed: ${safeMessage}`)
        return NextResponse.json(
            { ok: false, error: "Internal Server Error", details: { code: "INTERNAL_ERROR" } },
            { status: 500 }
        )
    }
}
