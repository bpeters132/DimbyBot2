"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type {
    GuildDashboardPermissionSnapshot,
    PlayerStateResponse,
    QueueResponse,
    QueueTrackSummary,
} from "@/types/web"
import { dashboardHasWebPermission } from "@/lib/dashboard-permissions"
import { WEB_PERMISSION } from "@/lib/web-permission-keys"
import { getPlayerQueueAction, getPlayerStateAction } from "@/server/player.actions"
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

function isSafeHttpUrl(value: string | null | undefined): boolean {
    if (!value) return false
    try {
        const parsed = new URL(value)
        return parsed.protocol === "http:" || parsed.protocol === "https:"
    } catch {
        return false
    }
}

function formatSourceName(sourceName: string | null): string {
    if (!sourceName) return "Unknown"
    return sourceName.charAt(0).toUpperCase() + sourceName.slice(1)
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

    const applyQueueResponse = (queueData: QueueResponse): void => {
        setBaseQueue(queueData.items)
        setBaseQueueTotal(queueData.total)
        setBaseQueuePage(queueData.page)
    }

    useEffect(() => {
        requestIdRef.current += 1
        const requestId = requestIdRef.current
        setQueuePage(1)

        const load = async () => {
            if (requestId !== requestIdRef.current) return
            setLoading(true)
            setQueueLoading(true)
            setError(null)

            try {
                const [playerResult, queueResult] = await Promise.all([
                    getPlayerStateAction(guildId),
                    getPlayerQueueAction(guildId, 1, QUEUE_PAGE_SIZE),
                ])

                if (requestId !== requestIdRef.current) return

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
                if (requestId !== requestIdRef.current) return
                setError(
                    loadError instanceof Error ? loadError.message : "Failed to load player state"
                )
            } finally {
                if (requestId === requestIdRef.current) {
                    setLoading(false)
                    setQueueLoading(false)
                }
            }
        }

        void load()

        return () => {
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

    const safeThumbnailUrl =
        nowPlaying?.thumbnailUrl && isSafeHttpUrl(nowPlaying.thumbnailUrl)
            ? nowPlaying.thumbnailUrl
            : null
    const safeTrackUrl = nowPlaying?.uri && isSafeHttpUrl(nowPlaying.uri) ? nowPlaying.uri : "#"

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
                    <div className="flex gap-4">
                        {safeThumbnailUrl ? (
                            <img
                                src={safeThumbnailUrl}
                                alt="artwork"
                                className="h-24 w-24 rounded object-cover"
                            />
                        ) : null}
                        <div className="space-y-1">
                            <div>
                                <a href={safeTrackUrl} target="_blank" rel="noreferrer">
                                    {nowPlaying.title}
                                </a>
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
                                Requested by: {nowPlaying.requesterId ?? "Unknown"}
                            </div>
                        </div>
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
                            {visibleQueue.map((track, index) => {
                                const queueIndex = queueRangeStart + index
                                const safeQueueTrackUrl =
                                    track.uri && isSafeHttpUrl(track.uri) ? track.uri : null
                                const safeQueueThumbnailUrl =
                                    track.thumbnailUrl && isSafeHttpUrl(track.thumbnailUrl)
                                        ? track.thumbnailUrl
                                        : null

                                return (
                                    <li
                                        key={track.encoded ?? track.uri ?? track.title}
                                        className="group relative rounded border bg-background p-2"
                                        tabIndex={0}
                                    >
                                        <div className="font-medium">
                                            {queueIndex}. {track.title}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {formatDuration(track.durationMs, track.isStream)}
                                        </div>
                                        <div className="pointer-events-none invisible absolute left-full top-1/2 z-50 ml-2 w-80 -translate-y-1/2 rounded border bg-popover p-3 text-popover-foreground opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
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
                                                    <div className="truncate font-medium">
                                                        {track.title}
                                                    </div>
                                                    <div className="text-muted-foreground">
                                                        Duration:{" "}
                                                        {formatDuration(
                                                            track.durationMs,
                                                            track.isStream
                                                        )}
                                                    </div>
                                                    <div className="text-muted-foreground">
                                                        Requested by:{" "}
                                                        {track.requesterId ?? "Unknown"}
                                                    </div>
                                                    <div className="text-muted-foreground">
                                                        Artist: {track.author ?? "Unknown"}
                                                    </div>
                                                    <div className="text-muted-foreground">
                                                        Source: {formatSourceName(track.sourceName)}
                                                    </div>
                                                    {safeQueueTrackUrl ? (
                                                        <div>
                                                            <a
                                                                href={safeQueueTrackUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="pointer-events-auto text-primary underline-offset-4 hover:underline"
                                                            >
                                                                Open track
                                                            </a>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                )
                            })}
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
