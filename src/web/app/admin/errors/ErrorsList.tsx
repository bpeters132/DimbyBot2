"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import type { AdminErrorsListResponse, ApiResponse, ErrorHistoryEntry } from "@/types/web"

const LIMIT_OPTIONS = [25, 50, 100, 250] as const

function levelBadgeClass(level: ErrorHistoryEntry["level"]): string {
    if (level === "error") {
        return "bg-destructive/15 text-destructive"
    }
    return "bg-amber-500/15 text-amber-800 dark:text-amber-200"
}

function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString()
}

/** Scrollable admin error history with guild filter and clear action. */
export function ErrorsList() {
    const [entries, setEntries] = useState<ErrorHistoryEntry[]>([])
    const [guildFilter, setGuildFilter] = useState("")
    const [limit, setLimit] = useState<number>(100)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [confirmClear, setConfirmClear] = useState(false)
    const [clearing, setClearing] = useState(false)

    const guildOptions = useMemo(() => {
        const ids = new Set<string>()
        for (const e of entries) {
            if (e.guildId) ids.add(e.guildId)
        }
        return Array.from(ids).sort()
    }, [entries])

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        const params = new URLSearchParams({ limit: String(limit) })
        if (guildFilter) params.set("guildId", guildFilter)
        try {
            const res = await fetch(`/api/admin/errors?${params.toString()}`, {
                credentials: "include",
            })
            const payload = (await res.json()) as ApiResponse<AdminErrorsListResponse>
            if (!res.ok || payload.ok === false) {
                const msg =
                    payload.ok === false
                        ? (payload.error.details ?? payload.error.error)
                        : `HTTP ${res.status}`
                setError(String(msg))
                setEntries([])
                return
            }
            setEntries(payload.data.entries)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load errors")
            setEntries([])
        } finally {
            setLoading(false)
        }
    }, [guildFilter, limit])

    useEffect(() => {
        void load()
    }, [load])

    async function handleClear() {
        if (!confirmClear) {
            setConfirmClear(true)
            return
        }
        setClearing(true)
        setError(null)
        try {
            const res = await fetch("/api/admin/errors", {
                method: "DELETE",
                credentials: "include",
            })
            const payload = (await res.json()) as ApiResponse<{ cleared: true }>
            if (!res.ok || payload.ok === false) {
                const msg =
                    payload.ok === false
                        ? (payload.error.details ?? payload.error.error)
                        : `HTTP ${res.status}`
                setError(String(msg))
                return
            }
            setConfirmClear(false)
            setEntries([])
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to clear history")
        } finally {
            setClearing(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm">
                    <span className="text-muted-foreground">Guild filter</span>
                    <select
                        className="rounded-md border bg-background px-3 py-2"
                        value={guildFilter}
                        onChange={(e) => setGuildFilter(e.target.value)}
                    >
                        <option value="">All guilds</option>
                        {guildOptions.map((id) => (
                            <option key={id} value={id}>
                                {id}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                    <span className="text-muted-foreground">Limit</span>
                    <select
                        className="rounded-md border bg-background px-3 py-2"
                        value={limit}
                        onChange={(e) => setLimit(Number(e.target.value))}
                    >
                        {LIMIT_OPTIONS.map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                </label>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => void load()}
                    disabled={loading}
                >
                    Refresh
                </Button>
                <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void handleClear()}
                    disabled={clearing}
                >
                    {confirmClear ? "Confirm clear history" : "Clear history"}
                </Button>
                {confirmClear ? (
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setConfirmClear(false)}
                        disabled={clearing}
                    >
                        Cancel
                    </Button>
                ) : null}
            </div>

            {error ? (
                <section className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    {error}
                </section>
            ) : null}

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
            ) : entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No errors in the buffer.</p>
            ) : (
                <ul className="max-h-[70vh] space-y-2 overflow-y-auto rounded-lg border p-2">
                    {entries.map((entry, index) => (
                        <li
                            key={`${entry.timestamp}-${index}`}
                            className="rounded-md border bg-card p-3 text-sm"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <time
                                    className="text-xs text-muted-foreground"
                                    dateTime={new Date(entry.timestamp).toISOString()}
                                >
                                    {formatTimestamp(entry.timestamp)}
                                </time>
                                <span
                                    className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${levelBadgeClass(entry.level)}`}
                                >
                                    {entry.level}
                                </span>
                                {entry.guildId ? (
                                    <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                                        {entry.guildId}
                                    </span>
                                ) : null}
                            </div>
                            <p className="mt-2 break-words whitespace-pre-wrap">{entry.message}</p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
