"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { FocusEvent } from "react"
import type {
    GuildDashboardPermissionSnapshot,
    PlayerStateResponse,
    PlayerTrackSummary,
    QueueResponse,
    QueueTrackSummary,
} from "@/types/web"
import {
    dashboardHasWebPermission,
    explainDashboardWebPermission,
} from "@/lib/dashboard-permissions"
import { WEB_PERMISSION } from "@/lib/web-permission-keys"
import { getPlayerQueueAction, getPlayerStateAction } from "@/lib/actions/player.actions"
import { ConnectionStatus } from "@/components/ConnectionStatus"
import { usePlayerActions } from "@/hooks/usePlayerActions"
import { usePlayerSocket } from "@/hooks/usePlayerSocket"

interface PlayerPanelProps {
    guildId: string
    /** Discord snowflake; must match `voiceStates` keys for socket voice updates. */
    discordUserId?: string
    /** Server-resolved web permissions (primary + OAuth fallback). */
    permissionSnapshot: GuildDashboardPermissionSnapshot
}

const QUEUE_PAGE_SIZE = 10

function formatDuration(durationMs: number, isStream = false): string {
    if (isStream) return "LIVE"
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, "0")}`
}

/** Returns the normalized URL when the scheme is http(s); otherwise null. */
function sanitizeHttpUrl(value?: string | null): string | null {
    if (!value) return null
    try {
        const parsed = new URL(value)
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
        return parsed.toString()
    } catch {
        return null
    }
}

function formatSourceName(sourceName: string | null): string {
    if (!sourceName) return "Unknown"
    return sourceName.charAt(0).toUpperCase() + sourceName.slice(1)
}

function requesterLabel(track: {
    requesterUsername?: string | null
    requesterId: string | null
}): string {
    const name = track.requesterUsername?.trim()
    if (name) return name
    if (track.requesterId) return `User ${track.requesterId}`
    return "Unknown"
}

/** Matches `w-80` (20rem) for clamp math. */
const QUEUE_TRACK_POPOVER_WIDTH_PX = 320
const QUEUE_TRACK_POPOVER_CURSOR_GAP_PX = 10

/** Keeps the queue detail card on-screen; `top` is the cursor Y (panel uses translateY(-50%)). */
function clampQueueTrackPopoverPoint(left: number, top: number): { left: number; top: number } {
    const margin = 8
    const halfHeightEstimate = 80
    const maxLeft = window.innerWidth - QUEUE_TRACK_POPOVER_WIDTH_PX - margin
    const clampedLeft = Math.max(margin, Math.min(left, maxLeft))
    const clampedTop = Math.max(
        halfHeightEstimate + margin,
        Math.min(top, window.innerHeight - halfHeightEstimate - margin)
    )
    return { left: clampedLeft, top: clampedTop }
}

interface QueueTrackRowProps {
    track: QueueTrackSummary
    queueIndex: number
}

/** Queue row with a fixed-position detail card anchored to the right of the pointer (keyboard: row edge). */
function QueueTrackRow({ track, queueIndex }: QueueTrackRowProps) {
    const liRef = useRef<HTMLLIElement>(null)
    const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)

    const safeQueueTrackUrl = useMemo(() => sanitizeHttpUrl(track.uri), [track.uri])
    const safeQueueThumbnailUrl = useMemo(
        () => sanitizeHttpUrl(track.thumbnailUrl),
        [track.thumbnailUrl]
    )

    const popoverLayout = anchor
        ? clampQueueTrackPopoverPoint(anchor.x + QUEUE_TRACK_POPOVER_CURSOR_GAP_PX, anchor.y)
        : null

    const handleRowFocus = (event: FocusEvent<HTMLElement>) => {
        const rect = event.currentTarget.getBoundingClientRect()
        setAnchor({
            x: rect.right,
            y: rect.top + rect.height / 2,
        })
    }

    const handleRowBlur = (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setAnchor(null)
        }
    }

    const rowLine = (
        <>
            <div className="font-medium">
                {queueIndex}. {track.title}
            </div>
            <div className="text-sm text-muted-foreground">
                {formatDuration(track.durationMs, track.isStream)}
            </div>
        </>
    )

    return (
        <li
            ref={liRef}
            className="rounded border bg-background p-2"
            tabIndex={safeQueueTrackUrl ? undefined : 0}
            onMouseMove={(event) => setAnchor({ x: event.clientX, y: event.clientY })}
            onMouseLeave={() => {
                window.requestAnimationFrame(() => {
                    if (!liRef.current?.contains(document.activeElement)) {
                        setAnchor(null)
                    }
                })
            }}
            onFocus={safeQueueTrackUrl ? undefined : handleRowFocus}
            onBlur={safeQueueTrackUrl ? undefined : handleRowBlur}
        >
            {safeQueueTrackUrl ? (
                <a
                    href={safeQueueTrackUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="-m-2 block cursor-pointer rounded-sm p-2 text-inherit no-underline decoration-transparent outline-none ring-offset-background transition-colors hover:bg-accent/50 hover:no-underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={`Open track source: ${track.title}`}
                    onFocus={handleRowFocus}
                    onBlur={handleRowBlur}
                >
                    {rowLine}
                </a>
            ) : (
                rowLine
            )}
            {popoverLayout ? (
                <div
                    className="fixed z-50 w-80 -translate-y-1/2 rounded border bg-popover p-3 text-popover-foreground shadow-lg"
                    style={{ left: popoverLayout.left, top: popoverLayout.top }}
                >
                    <div className="flex gap-3">
                        {safeQueueThumbnailUrl ? (
                            <img
                                src={safeQueueThumbnailUrl}
                                alt="queued track artwork"
                                className="h-16 w-16 rounded object-cover"
                            />
                        ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                                No Art
                            </div>
                        )}
                        <div className="min-w-0 space-y-1 text-sm">
                            <div className="truncate font-medium">{track.title}</div>
                            <div className="text-muted-foreground">
                                Duration: {formatDuration(track.durationMs, track.isStream)}
                            </div>
                            <div className="text-muted-foreground">
                                Requested by: {requesterLabel(track)}
                            </div>
                            <div className="text-muted-foreground">
                                Artist: {track.author ?? "Unknown"}
                            </div>
                            <div className="text-muted-foreground">
                                Source: {formatSourceName(track.sourceName)}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </li>
    )
}

interface NowPlayingProgressProps {
    playerState: PlayerStateResponse
    track: PlayerTrackSummary
}

/**
 * Elapsed / remaining bar; interpolates while `playing` because WebSocket updates are sparse.
 */
function NowPlayingProgress({ playerState, track }: NowPlayingProgressProps) {
    const [tick, setTick] = useState(0)
    const [anchor, setAnchor] = useState(() => ({
        positionMs: playerState.positionMs,
        wallMs: Date.now(),
    }))

    useEffect(() => {
        setAnchor({ positionMs: playerState.positionMs, wallMs: Date.now() })
    }, [playerState.positionMs, playerState.status, track.uri, track.durationMs])

    useEffect(() => {
        if (playerState.status !== "playing" || track.isStream || !track.durationMs) return
        const id = window.setInterval(() => setTick((n) => n + 1), 250)
        return () => window.clearInterval(id)
    }, [playerState.status, track.isStream, track.durationMs])

    // `tick` is unused in the body but listed so this memo recomputes on the interval above (smooth `livePositionMs`).
    const livePositionMs = useMemo(() => {
        if (track.isStream) return playerState.positionMs
        if (!track.durationMs || track.durationMs <= 0) return playerState.positionMs
        if (playerState.status !== "playing") {
            return Math.min(anchor.positionMs, track.durationMs)
        }
        return Math.min(anchor.positionMs + (Date.now() - anchor.wallMs), track.durationMs)
    }, [anchor, playerState.positionMs, playerState.status, track.durationMs, track.isStream, tick])

    if (track.isStream) {
        if (playerState.status !== "playing") return null
        return (
            <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                    <span>{formatDuration(playerState.positionMs, false)}</span>
                    <span>Live stream</span>
                </div>
                <div
                    className="h-2 w-full overflow-hidden rounded-full bg-muted"
                    aria-label="Live stream (no fixed duration)"
                    role="presentation"
                >
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/50" />
                </div>
            </div>
        )
    }

    if (!track.durationMs || track.durationMs <= 0) return null

    const remaining = Math.max(0, track.durationMs - livePositionMs)
    const pct = Math.min(100, Math.max(0, (livePositionMs / track.durationMs) * 100))
    const valueMax = Math.max(1, Math.ceil(track.durationMs / 1000))
    const valueNow = Math.min(valueMax, Math.floor(livePositionMs / 1000))

    return (
        <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>{formatDuration(livePositionMs, false)}</span>
                <span>{formatDuration(remaining, false)} left</span>
            </div>
            <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={valueMax}
                aria-valuenow={valueNow}
                aria-valuetext={`${formatDuration(livePositionMs, false)} of ${formatDuration(track.durationMs, false)}`}
                aria-label="Track playback position"
            >
                <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    )
}

export function PlayerPanel({ guildId, discordUserId, permissionSnapshot }: PlayerPanelProps) {
    /** Internal flags: pause/skip/stop from the site (not a Discord permission name). */
    const canControlPlayback = dashboardHasWebPermission(
        permissionSnapshot,
        WEB_PERMISSION.CONTROL_PLAYBACK
    )
    const canManageQueue = dashboardHasWebPermission(
        permissionSnapshot,
        WEB_PERMISSION.MANAGE_QUEUE
    )
    const [loading, setLoading] = useState(true)
    const [queueLoading, setQueueLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [baseState, setBaseState] = useState<PlayerStateResponse | null>(null)
    const [baseQueue, setBaseQueue] = useState<QueueTrackSummary[]>([])
    const [baseQueueTotal, setBaseQueueTotal] = useState(0)
    const [baseQueuePage, setBaseQueuePage] = useState(1)
    const [query, setQuery] = useState("")
    const [queuePage, setQueuePage] = useState(1)
    const [submitting, setSubmitting] = useState(false)

    /** Must be Discord snowflake (not Better Auth internal id) for voice-state matching. */
    const socketUserId = discordUserId
    const socket = usePlayerSocket(guildId, socketUserId)
    const actions = usePlayerActions(guildId, discordUserId)
    const requestIdRef = useRef(0)

    useEffect(() => {
        if (process.env.NODE_ENV !== "development") return
        console.log("[web-player] PlayerPanel snapshot + permissions", {
            guildId,
            discordUserIdPrefix: discordUserId?.slice(0, 8) ?? "(missing)",
            canControlPlayback,
            canManageQueue,
            controlExplain: explainDashboardWebPermission(
                permissionSnapshot,
                WEB_PERMISSION.CONTROL_PLAYBACK
            ),
            queueExplain: explainDashboardWebPermission(
                permissionSnapshot,
                WEB_PERMISSION.MANAGE_QUEUE
            ),
            permissionSnapshot,
        })
    }, [guildId, discordUserId, canControlPlayback, canManageQueue, permissionSnapshot])

    const applyQueueResponse = (queueData: QueueResponse): void => {
        setBaseQueue(queueData.items)
        setBaseQueueTotal(queueData.total)
        setBaseQueuePage(queueData.page)
    }

    useEffect(() => {
        requestIdRef.current += 1
        const requestId = requestIdRef.current
        setQueuePage(1)
        let active = true

        const load = async () => {
            if (requestId !== requestIdRef.current || !active) return
            setBaseState(null)
            setBaseQueue([])
            setBaseQueueTotal(0)
            setBaseQueuePage(1)
            setLoading(true)
            setQueueLoading(true)
            setError(null)

            try {
                const [playerResult, queueResult] = await Promise.all([
                    getPlayerStateAction(guildId),
                    getPlayerQueueAction(guildId, 1, QUEUE_PAGE_SIZE),
                ])

                if (requestId !== requestIdRef.current || !active) return

                if (playerResult.ok === false) {
                    setError(playerResult.error)
                    return
                }
                if (queueResult.ok === false) {
                    setError(queueResult.error)
                    return
                }

                setBaseState(playerResult.data)
                applyQueueResponse(queueResult.data)
            } catch (loadError) {
                if (requestId !== requestIdRef.current || !active) return
                setError(
                    loadError instanceof Error ? loadError.message : "Failed to load player state"
                )
            } finally {
                if (active && requestId === requestIdRef.current) {
                    setLoading(false)
                    setQueueLoading(false)
                }
            }
        }

        void load()

        return () => {
            active = false
            requestIdRef.current += 1
        }
    }, [guildId])

    useEffect(() => {
        if (socket.queue !== undefined || loading || queuePage === baseQueuePage) return

        let active = true
        const loadQueuePage = async () => {
            setQueueLoading(true)
            const queueResult = await getPlayerQueueAction(guildId, queuePage, QUEUE_PAGE_SIZE)
            if (!active) return

            if (queueResult.ok === false) {
                setError(queueResult.error)
            } else {
                applyQueueResponse(queueResult.data)
            }
            setQueueLoading(false)
        }

        void loadQueuePage()
        return () => {
            active = false
        }
    }, [baseQueuePage, guildId, loading, queuePage, socket.queue])

    const playerState = socket.playerState ?? baseState
    const socketQueue = socket.queue
    const queueTotal = socketQueue ? socketQueue.length : baseQueueTotal
    const queueTotalPages = Math.max(1, Math.ceil(queueTotal / QUEUE_PAGE_SIZE))

    useEffect(() => {
        if (queuePage > queueTotalPages) {
            setQueuePage(queueTotalPages)
        }
    }, [queuePage, queueTotalPages])

    const displayQueuePage = socketQueue ? queuePage : baseQueuePage
    const queueOffset = (displayQueuePage - 1) * QUEUE_PAGE_SIZE
    const visibleQueue = socketQueue
        ? socketQueue.slice(queueOffset, queueOffset + QUEUE_PAGE_SIZE)
        : queuePage === baseQueuePage
          ? baseQueue
          : []
    const queueRangeStart = queueTotal === 0 ? 0 : queueOffset + 1
    const queueRangeEnd =
        queueTotal === 0 ? 0 : Math.min(queueOffset + visibleQueue.length, queueTotal)
    const queueSummaryText =
        queueTotal === 0
            ? "Queue is empty"
            : !socketQueue && queueLoading && visibleQueue.length === 0
              ? `Loading page ${queuePage}...`
              : `Showing ${queueRangeStart}-${queueRangeEnd} of ${queueTotal}`

    const playbackControlsDisabled =
        !canControlPlayback || !playerState?.inVoiceWithBot || submitting
    const addTrackDisabled =
        !canManageQueue || submitting || (playerState ? !playerState.canQueueTracks : true)
    const nowPlaying = playerState?.currentTrack ?? null

    useEffect(() => {
        if (process.env.NODE_ENV !== "development") return
        const t = playerState?.currentTrack
        console.log("[web-player] PlayerPanel live state", {
            inVoiceWithBot: playerState?.inVoiceWithBot,
            canQueueTracks: playerState?.canQueueTracks,
            playbackControlsDisabled,
            currentRequesterId: t?.requesterId,
            currentRequesterUsername: t?.requesterUsername,
        })
    }, [playerState, playbackControlsDisabled])

    const loopLabel = useMemo(() => {
        if (!playerState) return "Off"
        return playerState.loopMode === "off"
            ? "Off"
            : playerState.loopMode === "track"
              ? "Track"
              : "Queue"
    }, [playerState])

    const runAction = async (runner: () => Promise<PlayerStateResponse>) => {
        setSubmitting(true)
        setError(null)
        try {
            const updated = await runner()
            setBaseState(updated)
            setQueuePage(1)
            if (socket.queue === undefined) {
                setQueueLoading(true)
                const queueResult = await getPlayerQueueAction(guildId, 1, QUEUE_PAGE_SIZE)
                if (queueResult.ok === false) {
                    setError(queueResult.error)
                } else {
                    applyQueueResponse(queueResult.data)
                }
                setQueueLoading(false)
            }
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Action failed")
        } finally {
            setSubmitting(false)
        }
    }

    const safeThumbnailUrl = sanitizeHttpUrl(nowPlaying?.thumbnailUrl)
    const safeTrackUrl = sanitizeHttpUrl(nowPlaying?.uri)

    if (loading) {
        return <div className="text-muted-foreground">Loading player...</div>
    }

    if (error && !playerState) {
        return <div className="text-red-300">{error}</div>
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Guild Player</h1>
                <ConnectionStatus connected={socket.isConnected} />
            </div>

            {error ? (
                <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
                    {error}
                </div>
            ) : null}

            {socket.liveUpdatesError ? (
                <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    <p className="font-medium">Live updates blocked</p>
                    <p className="mt-1 text-muted-foreground">{socket.liveUpdatesError}</p>
                </div>
            ) : null}

            {!playerState?.inVoiceWithBot ? (
                playerState?.botInVoiceChannel ? (
                    <div className="rounded border border-amber-500/60 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-300">
                        <p className="font-medium">Join the bot&apos;s voice channel</p>
                        <p className="mt-1 text-sm opacity-90">
                            Playback controls are available only when you are in the same Discord
                            voice channel as the bot.
                        </p>
                    </div>
                ) : (
                    <div className="rounded border border-sky-500/50 bg-sky-500/10 p-3 text-sky-900 dark:text-sky-100">
                        <p className="font-medium">Bot is not in a voice channel</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Join a voice channel in this server, then add a track below — the bot
                            will join your channel and start playing.
                        </p>
                        {!playerState?.canQueueTracks ? (
                            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200/90">
                                Connect to a voice channel in Discord first to enable Add track.
                            </p>
                        ) : null}
                    </div>
                )
            ) : null}

            {/* Only nag about “permission” when voice is already OK — otherwise the VC banners above apply. */}
            {!canControlPlayback && playerState?.inVoiceWithBot ? (
                <div className="rounded border border-muted-foreground/30 bg-muted/30 p-3 text-sm text-muted-foreground">
                    <p className="font-medium">
                        Pause, skip, and stop are disabled for your account
                    </p>
                    <p className="mt-1">
                        The bot did not grant you player controls from the website for this server
                        (same rules as its slash commands: it must recognize your member, and
                        moderators get broader access). Try signing out and back in with{" "}
                        <strong>Discord</strong> so your account links correctly.
                    </p>
                </div>
            ) : null}

            {!canManageQueue && Boolean(playerState?.canQueueTracks) ? (
                <div className="rounded border border-muted-foreground/30 bg-muted/30 p-3 text-sm text-muted-foreground">
                    <p className="font-medium">Adding tracks from the browser is disabled</p>
                    <p className="mt-1">
                        You are connected to voice, but the bot is not allowing queue changes from
                        the dashboard for your account. Re-login with Discord if you recently
                        changed roles.
                    </p>
                </div>
            ) : null}

            <section className="rounded border bg-card p-4 text-card-foreground">
                <h2 className="mb-2 text-lg font-medium">Now Playing</h2>
                {nowPlaying ? (
                    <div className="space-y-1">
                        <div className="flex gap-4">
                            {safeThumbnailUrl ? (
                                <img
                                    src={safeThumbnailUrl}
                                    alt="artwork"
                                    className="h-24 w-24 rounded object-cover"
                                />
                            ) : null}
                            <div className="min-w-0 flex-1 space-y-1">
                                <div>
                                    {safeTrackUrl ? (
                                        <a
                                            href={safeTrackUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-medium text-foreground no-underline decoration-transparent transition-colors hover:text-primary hover:no-underline"
                                        >
                                            {nowPlaying.title}
                                        </a>
                                    ) : (
                                        <span className="font-medium text-foreground">
                                            {nowPlaying.title}
                                        </span>
                                    )}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    Duration:{" "}
                                    {formatDuration(nowPlaying.durationMs, nowPlaying.isStream)}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    Queue: {playerState?.queueCount ?? 0} songs
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    Status: {playerState?.status ?? "idle"} | Loop: {loopLabel} |
                                    Autoplay: {playerState?.autoplay ? "On" : "Off"}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    Requested by: {requesterLabel(nowPlaying)}
                                </div>
                            </div>
                        </div>
                        {playerState ? (
                            <NowPlayingProgress playerState={playerState} track={nowPlaying} />
                        ) : null}
                    </div>
                ) : (
                    <p className="text-muted-foreground">Nothing playing. Add a song!</p>
                )}
            </section>

            {canControlPlayback ? (
                <section className="rounded border bg-card p-4 text-card-foreground">
                    <h2 className="mb-2 text-lg font-medium">Controls</h2>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="rounded border bg-secondary px-3 py-2 text-secondary-foreground hover:opacity-90 disabled:opacity-50"
                            disabled={playbackControlsDisabled || !playerState?.currentTrack}
                            onClick={() => void runAction(actions.playPause)}
                        >
                            {playerState?.status === "playing" ? "Pause" : "Play"}
                        </button>
                        <button
                            type="button"
                            className="rounded bg-destructive px-3 py-2 text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                            disabled={playbackControlsDisabled || !playerState?.currentTrack}
                            onClick={() => void runAction(actions.stop)}
                        >
                            Stop
                        </button>
                        <button
                            type="button"
                            className="rounded border bg-secondary px-3 py-2 text-secondary-foreground hover:opacity-90 disabled:opacity-50"
                            disabled={playbackControlsDisabled || !playerState?.currentTrack}
                            onClick={() => void runAction(actions.skip)}
                        >
                            Skip
                        </button>
                        <button
                            type="button"
                            className="rounded border bg-secondary px-3 py-2 text-secondary-foreground hover:opacity-90 disabled:opacity-50"
                            disabled={playbackControlsDisabled || queueTotal < 2}
                            onClick={() => void runAction(actions.shuffle)}
                        >
                            Shuffle
                        </button>
                        <button
                            type="button"
                            className="rounded border bg-secondary px-3 py-2 text-secondary-foreground hover:opacity-90 disabled:opacity-50"
                            disabled={
                                playbackControlsDisabled ||
                                (!playerState?.currentTrack && queueTotal === 0)
                            }
                            onClick={() => void runAction(actions.toggleLoop)}
                        >
                            Loop ({loopLabel})
                        </button>
                    </div>

                    <div className="mt-3">
                        <button
                            type="button"
                            className="rounded border bg-secondary px-3 py-2 text-secondary-foreground hover:opacity-90 disabled:opacity-50"
                            disabled={playbackControlsDisabled || !playerState}
                            onClick={() => void runAction(actions.toggleAutoplay)}
                        >
                            Autoplay: {playerState?.autoplay ? "On" : "Off"}
                        </button>
                    </div>
                </section>
            ) : null}

            {canManageQueue ? (
                <section className="rounded border bg-card p-4 text-card-foreground">
                    <h2 className="mb-2 text-lg font-medium">Add Track</h2>
                    <form
                        className="flex flex-col gap-2 md:flex-row"
                        onSubmit={(event) => {
                            event.preventDefault()
                            if (!query.trim()) return
                            void runAction(() => actions.addTrack(query.trim()))
                            setQuery("")
                        }}
                    >
                        <input
                            className="flex-1 rounded border bg-background px-3 py-2"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search or paste a URL"
                            disabled={addTrackDisabled}
                        />
                        <button
                            type="submit"
                            className="rounded bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:opacity-50"
                            disabled={addTrackDisabled || !query.trim()}
                        >
                            Add
                        </button>
                    </form>
                </section>
            ) : null}

            <section className="rounded border bg-card p-4 text-card-foreground">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-medium">Queue</h2>
                    <div className="text-sm text-muted-foreground">{queueSummaryText}</div>
                </div>
                {!socketQueue && queueLoading && queueTotal === 0 ? (
                    <p className="text-muted-foreground">Loading queue...</p>
                ) : queueTotal === 0 ? (
                    <p className="text-muted-foreground">Queue is empty.</p>
                ) : (
                    <>
                        <ol className="space-y-2" start={queueRangeStart}>
                            {visibleQueue.map((track, index) => (
                                <QueueTrackRow
                                    key={
                                        track.encoded ?? track.uri ?? `q-${queueRangeStart + index}`
                                    }
                                    track={track}
                                    queueIndex={queueRangeStart + index}
                                />
                            ))}
                        </ol>
                        <div className="mt-3 flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                Page {displayQueuePage} of {queueTotalPages}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    className="rounded border bg-secondary px-3 py-1 text-secondary-foreground hover:opacity-90 disabled:opacity-50"
                                    disabled={queuePage <= 1}
                                    onClick={() =>
                                        setQueuePage((current) => Math.max(1, current - 1))
                                    }
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    className="rounded border bg-secondary px-3 py-1 text-secondary-foreground hover:opacity-90 disabled:opacity-50"
                                    disabled={queuePage >= queueTotalPages}
                                    onClick={() =>
                                        setQueuePage((current) =>
                                            Math.min(queueTotalPages, current + 1)
                                        )
                                    }
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </section>
        </div>
    )
}
