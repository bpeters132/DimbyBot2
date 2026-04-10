"use client"

import { useCallback, useEffect, useState } from "react"
import type { StatusPayload } from "@/types/web"
import { getServiceStatusAction } from "@/server/status.actions"

function statusLabel(ok: boolean): string {
    return ok ? "Up" : "Down"
}

function statusClass(ok: boolean): string {
    return ok ? "text-emerald-500" : "text-amber-500"
}

export function StatusChecker() {
    const [data, setData] = useState<StatusPayload | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const json = await getServiceStatusAction()
            setData(json)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load status")
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                    {loading ? "Checking…" : "Refresh"}
                </button>
                {data?.checkedAt ? (
                    <span className="text-xs text-muted-foreground">
                        Last check: {new Date(data.checkedAt).toLocaleString()}
                    </span>
                ) : null}
            </div>

            {error ? (
                <p className="text-sm text-amber-500" role="alert">
                    {error}
                </p>
            ) : null}

            {data ? (
                <ul className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground">
                    <li className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">Database (auth / sessions)</span>
                            <span className={`text-sm font-semibold ${statusClass(data.database.ok)}`}>
                                {statusLabel(data.database.ok)}
                            </span>
                        </div>
                        {data.database.message ? (
                            <p className="text-xs text-muted-foreground">{data.database.message}</p>
                        ) : null}
                    </li>
                    <li className="space-y-1 border-t border-border pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">Bot HTTP (/health via API_PROXY_TARGET)</span>
                            <span className={`text-sm font-semibold ${statusClass(data.botApi.ok)}`}>
                                {statusLabel(data.botApi.ok)}
                            </span>
                        </div>
                        {data.botApi.message ? (
                            <p className="text-xs text-muted-foreground">{data.botApi.message}</p>
                        ) : null}
                    </li>
                </ul>
            ) : null}

            {!loading && !data && !error ? (
                <p className="text-sm text-muted-foreground">No status data yet.</p>
            ) : null}
        </div>
    )
}
