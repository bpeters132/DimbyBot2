import { ServiceDegraded } from "@/components/ServiceDegraded"
import { serverFetchBot } from "@/server/fetch-bot-api"
import type { AdminDbStatsResponse, ApiResponse } from "@/types/web"
import { DatabaseTools } from "./DatabaseTools"

export const dynamic = "force-dynamic"

async function loadStats(): Promise<
    { ok: true; data: AdminDbStatsResponse } | { ok: false; error: string }
> {
    const res = await serverFetchBot("/api/admin/database/stats")
    const text = await res.text()
    if (!text.trim()) {
        return { ok: false, error: "Empty response from bot API." }
    }
    let payload: unknown
    try {
        payload = JSON.parse(text)
    } catch {
        return { ok: false, error: "Bot API returned invalid JSON." }
    }
    const typed = payload as ApiResponse<AdminDbStatsResponse>
    if (!res.ok || typed.ok === false) {
        const details =
            typed.ok === false && typed.error?.details
                ? String(typed.error.details)
                : typed.ok === false
                  ? typed.error.error
                  : `HTTP ${res.status}`
        return { ok: false, error: details }
    }
    return { ok: true, data: typed.data }
}

/** Admin database maintenance: stats and expired-row cleanup. */
export default async function AdminDatabasePage() {
    const result = await loadStats()

    if (result.ok === false) {
        return (
            <ServiceDegraded
                title="Could not load database stats"
                description="The bot API did not return session/verification counts."
                detail={result.error}
            />
        )
    }

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Database tools</h1>
                <p className="text-sm text-muted-foreground">
                    Better Auth session and verification table maintenance.
                </p>
            </div>
            <DatabaseTools initialStats={result.data} />
        </div>
    )
}
