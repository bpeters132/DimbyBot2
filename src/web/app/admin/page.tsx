import Link from "next/link"
import { ServiceDegraded } from "@/components/ServiceDegraded"
import { serverFetchBot } from "@/server/fetch-bot-api"
import type { AdminMetricsResponse, ApiResponse } from "@/types/web"

export const dynamic = "force-dynamic"

function statusPillClass(status: "playing" | "paused" | "idle"): string {
    if (status === "playing") {
        return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    }
    if (status === "paused") {
        return "bg-amber-500/15 text-amber-800 dark:text-amber-200"
    }
    return "bg-muted text-muted-foreground"
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}

function isAdminMetricsResponse(value: unknown): value is AdminMetricsResponse {
    if (!isRecord(value)) return false
    if (typeof value.guildCount !== "number") return false
    if (typeof value.activePlayers !== "number") return false
    if (typeof value.nodeCount !== "number") return false
    if (!Array.isArray(value.guilds) || !Array.isArray(value.players)) return false
    for (const g of value.guilds) {
        if (!isRecord(g) || typeof g.guildId !== "string") return false
        if (g.guildName !== null && typeof g.guildName !== "string") return false
        if (g.memberCount !== null && typeof g.memberCount !== "number") return false
    }
    for (const p of value.players) {
        if (!isRecord(p)) return false
        if (typeof p.guildId !== "string") return false
        if (p.guildName !== null && typeof p.guildName !== "string") return false
        if (p.status !== "playing" && p.status !== "paused" && p.status !== "idle") return false
        if (typeof p.queueSize !== "number") return false
        const ct = p.currentTrack
        if (ct != null) {
            if (!isRecord(ct) || typeof ct.title !== "string") return false
            if (ct.author !== undefined && typeof ct.author !== "string") return false
            if (ct.uri !== undefined && typeof ct.uri !== "string") return false
        }
    }
    return true
}

async function loadMetrics(): Promise<
    { ok: true; data: AdminMetricsResponse } | { ok: false; error: string }
> {
    try {
        const res = await serverFetchBot("/api/admin/metrics")
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
            return { ok: false, error: "Invalid response payload" }
        }

        const typed = payload as unknown as ApiResponse<AdminMetricsResponse>
        if (!res.ok || typed.ok === false) {
            const details =
                typed.ok === false && typed.error?.details
                    ? String(typed.error.details)
                    : typed.ok === false
                      ? typed.error.error
                      : `HTTP ${res.status}`
            return { ok: false, error: details }
        }

        if (typed.ok !== true || !("data" in typed)) {
            return { ok: false, error: "Invalid response payload" }
        }

        if (!isAdminMetricsResponse(typed.data)) {
            return { ok: false, error: "Invalid response payload" }
        }

        return { ok: true, data: typed.data }
    } catch (err: unknown) {
        return { ok: false, error: String(err) }
    }
}

/** Admin overview: active Lavalink players and node count. */
export default async function AdminOverviewPage() {
    const result = await loadMetrics()

    if (result.ok === false) {
        return (
            <ServiceDegraded
                title="Could not load metrics"
                description="The bot API did not return player metrics."
                detail={result.error}
            />
        )
    }

    const { guildCount, guilds, activePlayers, nodeCount, players } = result.data

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">Overview</h1>
                <p className="text-sm text-muted-foreground">
                    Servers the bot is in, Lavalink players, and node summary.
                </p>
            </div>

            <section className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Servers</p>
                    <p className="mt-1 text-3xl font-semibold tabular-nums">{guildCount}</p>
                </div>
                <div className="rounded-lg border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Active players</p>
                    <p className="mt-1 text-3xl font-semibold tabular-nums">{activePlayers}</p>
                </div>
                <div className="rounded-lg border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Lavalink nodes</p>
                    <p className="mt-1 text-3xl font-semibold tabular-nums">{nodeCount}</p>
                </div>
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-medium">Servers</h2>
                {guilds.length === 0 ? (
                    <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                        No guilds in cache (bot may still be connecting).
                    </div>
                ) : (
                    <ul className="max-h-[min(24rem,50vh)] space-y-1 overflow-y-auto rounded-lg border bg-card p-2 text-sm">
                        {guilds.map((g) => {
                            const guildDisplayName = g.guildName ?? `Guild ${g.guildId}`
                            return (
                                <li
                                    key={g.guildId}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                                >
                                    <div className="min-w-0">
                                        <Link
                                            href={`/dashboard/${g.guildId}`}
                                            className="font-medium text-primary underline-offset-4 hover:underline"
                                            aria-label={`Open dashboard for ${guildDisplayName}`}
                                            title={guildDisplayName}
                                        >
                                            {guildDisplayName}
                                        </Link>
                                        <p className="font-mono text-xs text-muted-foreground">
                                            {g.guildId}
                                        </p>
                                    </div>
                                    {g.memberCount != null ? (
                                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                            {g.memberCount.toLocaleString()} members
                                        </span>
                                    ) : null}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-medium">Active Lavalink players</h2>
                {players.length === 0 ? (
                    <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                        No active players.
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {players.map((player) => (
                            <li
                                key={player.guildId}
                                className="rounded-lg border bg-card p-4 text-sm"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="font-medium">
                                            {player.guildName ?? `Guild ${player.guildId}`}
                                        </p>
                                        <p className="font-mono text-xs text-muted-foreground">
                                            {player.guildId}
                                        </p>
                                    </div>
                                    <span
                                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusPillClass(player.status)}`}
                                    >
                                        {player.status}
                                    </span>
                                </div>
                                <p className="mt-2 text-muted-foreground">
                                    Queue: {player.queueSize}
                                    {player.currentTrack ? (
                                        <>
                                            {" "}
                                            · Now: {player.currentTrack.title}
                                            {player.currentTrack.author
                                                ? ` — ${player.currentTrack.author}`
                                                : ""}
                                        </>
                                    ) : (
                                        " · No current track"
                                    )}
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <p className="text-sm text-muted-foreground">
                <Link
                    href="/admin/errors"
                    className="text-primary underline-offset-4 hover:underline"
                >
                    View error history
                </Link>
                {" · "}
                <Link
                    href="/admin/database"
                    className="text-primary underline-offset-4 hover:underline"
                >
                    Database tools
                </Link>
            </p>
        </div>
    )
}
