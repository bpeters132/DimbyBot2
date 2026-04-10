import { NextResponse } from "next/server"
import { getServiceStatusPayload } from "@/server/service-status"

/** Reports whether the dashboard database and bot HTTP port respond (for local / split-stack dev). */
export async function GET(): Promise<NextResponse> {
    const payload = await getServiceStatusPayload()
    return NextResponse.json(payload)
}
