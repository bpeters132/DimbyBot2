import { NextResponse } from "next/server"
import { getServiceStatusPayload } from "@/server/service-status"

/**
 * Reports whether the dashboard database and bot HTTP port respond (for local / split-stack dev).
 * Intentionally public for uptime/monitoring — do not add session middleware here.
 */
export async function GET(): Promise<NextResponse> {
    try {
        const payload = await getServiceStatusPayload()
        return NextResponse.json(payload)
    } catch (error: unknown) {
        const name = error instanceof Error ? error.name : "Error"
        const message = error instanceof Error ? error.message : "status probe failed"
        console.error("[api/status] status probe failed", { name, message })
        const checkedAt = new Date().toISOString()
        return NextResponse.json(
            {
                ok: false,
                checkedAt,
                database: { ok: false, message: "Status check failed" },
                botApi: { ok: false, message: "Status check failed" },
            },
            { status: 503 }
        )
    }
}
