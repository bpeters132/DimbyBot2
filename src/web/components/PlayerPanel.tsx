"use client"

import { useEffect, useMemo, useState } from "react"
import type {
    GuildDashboardPermissionSnapshot,
    PlayerStateResponse,
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

function formatDuration(durationMs: number, isStream = false): string {
    if (isStream) return "LIVE"
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, "0")}`
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
    const [error, setError] = useState<string | null>(null)
    const [baseState, setBaseState] = useState<PlayerStateResponse | null>(null)
    const [baseQueue, setBaseQueue] = useState<QueueTrackSummary[]>([])
    const [query, setQuery] = useState("")
    const [submitting, setSubmitting] = useState(false)

    /** Must be Discord snowflake (not Better Auth internal id) for voice-state matching. */
    const socketUserId = discordUserId
    const socket = usePlayerSocket(guildId, socketUserId)
    const actions = usePlayerActions(guildId, discordUserId)

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            setError(null)

            const [playerResult, queueResult] = await Promise.all([
                getPlayerStateAction(guildId),
                getPlayerQueueAction(guildId, 1, 50),
            ])

            if (!playerResult.ok) {
                setError(playerResult.error)
                setLoading(false)
                return
            }
            if (!queueResult.ok) {
                setError(queueResult.error)
                setLoading(false)
                return
            }

            setBaseState(playerResult.data)
            setBaseQueue(queueResult.data.items)
            setLoading(false)
        }

        void load()
    }, [guildId])

    const playerState = socket.playerState ?? baseState
    const queue = socket.queue.length > 0 ? socket.queue : baseQueue
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
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Action failed")
        } finally {
            setSubmitting(false)
        }
    }

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
                        {nowPlaying.thumbnailUrl ? (
                            <img
                                src={nowPlaying.thumbnailUrl}
                                alt="artwork"
                                className="h-24 w-24 rounded object-cover"
                            />
                        ) : null}
                        <div className="space-y-1">
                            <div>
                                <a href={nowPlaying.uri ?? "#"} target="_blank" rel="noreferrer">
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
                            disabled={playbackControlsDisabled || queue.length < 2}
                            onClick={() => void runAction(actions.shuffle)}
                        >
                            Shuffle
                        </button>
                        <button
                            type="button"
                            className="rounded border bg-secondary px-3 py-2 text-secondary-foreground hover:opacity-90 disabled:opacity-50"
                            disabled={
                                playbackControlsDisabled ||
                                (!playerState?.currentTrack && queue.length === 0)
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
                <h2 className="mb-2 text-lg font-medium">Queue</h2>
                {queue.length === 0 ? (
                    <p className="text-muted-foreground">Queue is empty.</p>
                ) : (
                    <ol className="space-y-2">
                        {queue.map((track, index) => (
                            <li
                                key={`${track.title}-${index}`}
                                className="rounded border bg-background p-2"
                            >
                                <div className="font-medium">
                                    {index + 1}. {track.title}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    {formatDuration(track.durationMs, track.isStream)}
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </section>
        </div>
    )
}
