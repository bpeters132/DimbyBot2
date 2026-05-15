"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import type {
    AdminDbCleanupResponse,
    AdminDbCleanupTarget,
    AdminDbStatsResponse,
    ApiResponse,
} from "@/types/web"

type DatabaseToolsProps = {
    initialStats: AdminDbStatsResponse
}

/** Expired session/verification cleanup with dry-run preview. */
export function DatabaseTools({ initialStats }: DatabaseToolsProps) {
    const [stats, setStats] = useState(initialStats)
    const [target, setTarget] = useState<AdminDbCleanupTarget>("all")
    const [preview, setPreview] = useState<AdminDbCleanupResponse | null>(null)
    const [result, setResult] = useState<AdminDbCleanupResponse | null>(null)
    const [confirmRun, setConfirmRun] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function runCleanup(dryRun: boolean) {
        setLoading(true)
        setError(null)
        if (!dryRun) setResult(null)
        try {
            const url = dryRun
                ? "/api/admin/database/cleanup?dryRun=true"
                : "/api/admin/database/cleanup"
            const res = await fetch(url, {
                method: "POST",
                credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ target }),
            })
            const payload = (await res.json()) as ApiResponse<AdminDbCleanupResponse>
            if (!res.ok || payload.ok === false) {
                const msg =
                    payload.ok === false
                        ? (payload.error.details ?? payload.error.error)
                        : `HTTP ${res.status}`
                setError(String(msg))
                return
            }
            if (dryRun) {
                setPreview(payload.data)
                setConfirmRun(false)
            } else {
                setResult(payload.data)
                setPreview(null)
                setConfirmRun(false)
                const statsRes = await fetch("/api/admin/database/stats", {
                    credentials: "include",
                })
                const statsPayload = (await statsRes.json()) as ApiResponse<AdminDbStatsResponse>
                if (statsRes.ok && statsPayload.ok === true) {
                    setStats(statsPayload.data)
                }
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Cleanup request failed")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border bg-card p-4">
                    <h2 className="font-medium">Sessions</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Total:{" "}
                        <span className="font-mono text-foreground">{stats.sessions.total}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Expired:{" "}
                        <span className="font-mono text-foreground">{stats.sessions.expired}</span>
                    </p>
                </div>
                <div className="rounded-lg border bg-card p-4">
                    <h2 className="font-medium">Verifications</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Total:{" "}
                        <span className="font-mono text-foreground">
                            {stats.verifications.total}
                        </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Expired:{" "}
                        <span className="font-mono text-foreground">
                            {stats.verifications.expired}
                        </span>
                    </p>
                </div>
            </section>

            <section className="space-y-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                <div>
                    <h2 className="font-medium text-amber-950 dark:text-amber-100">
                        Cleanup expired rows
                    </h2>
                    <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">
                        Deletes rows where <code className="text-xs">expiresAt</code> is in the
                        past. Run a dry-run preview before deleting.
                    </p>
                </div>

                <fieldset className="flex flex-wrap gap-4 text-sm">
                    {(
                        [
                            ["sessions", "Sessions only"],
                            ["verifications", "Verifications only"],
                            ["all", "Sessions and verifications"],
                        ] as const
                    ).map(([value, label]) => (
                        <label key={value} className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="cleanup-target"
                                value={value}
                                checked={target === value}
                                onChange={() => {
                                    setTarget(value)
                                    setPreview(null)
                                    setResult(null)
                                    setConfirmRun(false)
                                }}
                            />
                            {label}
                        </label>
                    ))}
                </fieldset>

                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={loading}
                        onClick={() => void runCleanup(true)}
                    >
                        Preview (dry run)
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={loading || !preview}
                        onClick={() => {
                            if (!confirmRun) {
                                setConfirmRun(true)
                                return
                            }
                            void runCleanup(false)
                        }}
                    >
                        {confirmRun ? "Confirm delete expired rows" : "Run cleanup"}
                    </Button>
                    {confirmRun ? (
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={loading}
                            onClick={() => setConfirmRun(false)}
                        >
                            Cancel
                        </Button>
                    ) : null}
                </div>

                {preview ? (
                    <div className="rounded-md border bg-background/60 p-3 text-sm">
                        <p className="font-medium">Dry-run preview</p>
                        {preview.deleted.sessions !== undefined ? (
                            <p>Sessions to delete: {preview.deleted.sessions}</p>
                        ) : null}
                        {preview.deleted.verifications !== undefined ? (
                            <p>Verifications to delete: {preview.deleted.verifications}</p>
                        ) : null}
                    </div>
                ) : null}

                {result && !result.dryRun ? (
                    <div className="rounded-md border bg-background/60 p-3 text-sm">
                        <p className="font-medium">Cleanup complete</p>
                        {result.deleted.sessions !== undefined ? (
                            <p>Sessions deleted: {result.deleted.sessions}</p>
                        ) : null}
                        {result.deleted.verifications !== undefined ? (
                            <p>Verifications deleted: {result.deleted.verifications}</p>
                        ) : null}
                    </div>
                ) : null}

                {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </section>
        </div>
    )
}
