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
    } catch (error) {
        console.error("[api/status] status probe failed", error)
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : "status probe failed",
            },
            { status: 503 }
        )
    }
}
