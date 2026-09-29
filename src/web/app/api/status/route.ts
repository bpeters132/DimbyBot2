import { NextResponse } from "next/server"
import { getServiceStatusPayload } from "@/server/service-status.js"
import { mapServiceStatusProbeCrash } from "@/lib/service-status-probes"

export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "no-store, max-age=0, must-revalidate" }

/**
 * Reports whether the dashboard database and bot HTTP port respond (for local / split-stack dev).
 * Intentionally public for uptime/monitoring — do not add session middleware here.
 */
export async function GET(): Promise<NextResponse> {
    try {
        const payload = await getServiceStatusPayload()
        return NextResponse.json(payload, { headers: noStore })
    } catch (error: unknown) {
        const name = error instanceof Error ? error.name : "Error"
        console.error("[api/status] status probe failed", { name })
        const checkedAt = new Date().toISOString()
        return NextResponse.json(mapServiceStatusProbeCrash(checkedAt), {
            status: 503,
            headers: noStore,
        })
    }
}
