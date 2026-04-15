import { NextResponse } from "next/server"

const noStore = { "Cache-Control": "no-store, max-age=0, must-revalidate" }

/** Cheap liveness probe for Docker/orchestrators. Use `GET /api/status` for Postgres + bot checks. */
export async function GET(): Promise<NextResponse> {
    return NextResponse.json(
        { ok: true, service: "dimbybot-web" },
        { status: 200, headers: noStore }
    )
}
