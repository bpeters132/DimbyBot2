import { ServiceDegraded } from "@/components/ServiceDegraded"
import { serverFetchBot } from "@/server/fetch-bot-api"
import type { AdminDbStatsResponse, ApiResponse } from "@/types/web"
import { DatabaseTools } from "./DatabaseTools.js"

export const dynamic = "force-dynamic"

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}

function isAdminDbStatsResponse(value: unknown): value is AdminDbStatsResponse {
    if (!isRecord(value)) return false
    const { sessions, verifications } = value
    if (!isRecord(sessions) || !isRecord(verifications)) return false
    return (
        typeof sessions.total === "number" &&
        typeof sessions.expired === "number" &&
        typeof verifications.total === "number" &&
        typeof verifications.expired === "number"
    )
}

async function loadStats(): Promise<
    { ok: true; data: AdminDbStatsResponse } | { ok: false; error: string }
> {
    try {
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

        if (!isRecord(payload) || typeof payload.ok !== "boolean") {
            return { ok: false, error: "Invalid response payload from bot API." }
        }

        const typed = payload as unknown as ApiResponse<AdminDbStatsResponse>
        if (!res.ok || typed.ok === false) {
            const errObj =
                typed.ok === false && typed.error && typeof typed.error === "object"
                    ? (typed.error as { error?: unknown; details?: unknown })
                    : null
            const details =
                errObj?.details != null
                    ? String(errObj.details)
                    : errObj?.error != null
                      ? String(errObj.error)
                      : `HTTP ${res.status}`
            return { ok: false, error: details }
        }

        if (typed.ok !== true || !("data" in typed)) {
            return { ok: false, error: "Invalid response payload: missing data." }
        }

        if (!isAdminDbStatsResponse(typed.data)) {
            return { ok: false, error: "Invalid response payload: malformed stats." }
        }

        return { ok: true, data: typed.data }
    } catch (err: unknown) {
        return { ok: false, error: String(err) }
    }
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
