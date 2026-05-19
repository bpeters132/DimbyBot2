"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { DragEvent } from "react"
import Link from "next/link"
import {
    deletePlaylistAction,
    movePlaylistTrackAction,
    removeTrackFromPlaylistAction,
} from "@/lib/actions/playlist.actions"
import { formatDurationMs } from "@/lib/format-duration"
import { AddTrackToPlaylistForm } from "@/components/AddTrackToPlaylistForm"
import { PlaylistDiscordHelp } from "@/components/PlaylistDiscordHelp"
import { PlaylistTrackRow } from "@/components/PlaylistTrackRow"
import { Button } from "@/components/ui/button"
import type { PlaylistTrackData } from "@/types/web"

export interface PlaylistTrackListProps {
    playlistId: number
    playlistName: string
    tracks: PlaylistTrackData[]
    guildId?: string
}

function sortTracks(tracks: PlaylistTrackData[]): PlaylistTrackData[] {
    return [...tracks].sort((a, b) => a.position - b.position)
}

export function PlaylistTrackList({
    playlistId,
    playlistName,
    tracks,
    guildId,
}: PlaylistTrackListProps) {
    const router = useRouter()
    const [confirmDeletePlaylist, setConfirmDeletePlaylist] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [orderedTracks, setOrderedTracks] = useState(() => sortTracks(tracks))
    const [dragIndex, setDragIndex] = useState<number | null>(null)
    const [overIndex, setOverIndex] = useState<number | null>(null)
    const dragIndexRef = useRef<number | null>(null)

    useEffect(() => {
        setOrderedTracks(sortTracks(tracks))
    }, [tracks])

    const totalDurationMs = useMemo(
        () => orderedTracks.reduce((acc, t) => acc + t.duration, 0),
        [orderedTracks]
    )

    const handleDragStart = useCallback((index: number, event: DragEvent<HTMLLIElement>) => {
        dragIndexRef.current = index
        setDragIndex(index)
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("text/plain", String(index))
    }, [])

    const handleDragOver = useCallback((index: number, event: DragEvent<HTMLLIElement>) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
        setOverIndex(index)
    }, [])

    const handleDrop = useCallback(
        (toIndex: number, event: DragEvent<HTMLLIElement>) => {
            event.preventDefault()
            const fromIndex = dragIndexRef.current
            setOverIndex(null)
            setDragIndex(null)
            dragIndexRef.current = null

            if (fromIndex === null || fromIndex === toIndex || busy) return

            const previous = orderedTracks.map((track) => ({ ...track }))
            const fromTrack = orderedTracks[fromIndex]
            if (!fromTrack) return
            const originalFromPosition = fromTrack.position

            const reordered = [...orderedTracks]
            const [moved] = reordered.splice(fromIndex, 1)
            if (!moved) return
            reordered.splice(toIndex, 0, moved)
            const next = reordered.map((track, index) => ({
                ...track,
                position: index + 1,
            }))
            setOrderedTracks(next)

            void (async () => {
                setBusy(true)
                setError(null)
                const result = await movePlaylistTrackAction(
                    playlistId,
                    originalFromPosition,
                    toIndex + 1
                )
                setBusy(false)
                if (result.ok === false) {
                    setError(result.error)
                    setOrderedTracks(previous)
                    return
                }
                router.refresh()
            })()
        },
        [busy, orderedTracks, playlistId, router]
    )

    const handleRemove = useCallback(
        (position: number) => {
            void (async () => {
                setBusy(true)
                setError(null)
                const result = await removeTrackFromPlaylistAction(playlistId, position)
                setBusy(false)
                if (result.ok === false) {
                    setError(result.error)
                    return
                }
                router.refresh()
            })()
        },
        [playlistId, router]
    )

    const handleDragEnd = useCallback(() => {
        dragIndexRef.current = null
        setDragIndex(null)
        setOverIndex(null)
    }, [])

    return (
        <div className="space-y-6">
            <section className="rounded border bg-card p-4 text-card-foreground">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">{playlistName}</h1>
                        <p className="text-sm text-muted-foreground">
                            {orderedTracks.length} track{orderedTracks.length === 1 ? "" : "s"} ·{" "}
                            {formatDurationMs(totalDurationMs)}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/playlists">Back to playlists</Link>
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                                if (!confirmDeletePlaylist) {
                                    setConfirmDeletePlaylist(true)
                                    return
                                }
                                void (async () => {
                                    setBusy(true)
                                    setError(null)
                                    const result = await deletePlaylistAction(playlistId)
                                    setBusy(false)
                                    if (result.ok === false) {
                                        setError(result.error)
                                        setConfirmDeletePlaylist(false)
                                        return
                                    }
                                    router.push("/playlists")
                                })()
                            }}
                        >
                            {confirmDeletePlaylist ? "Confirm delete playlist" : "Delete playlist"}
                        </Button>
                        {confirmDeletePlaylist ? (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => setConfirmDeletePlaylist(false)}
                            >
                                Cancel
                            </Button>
                        ) : null}
                    </div>
                </div>
                <PlaylistDiscordHelp />
            </section>

            <section className="rounded border bg-card p-4 text-card-foreground">
                <h2 className="mb-3 text-lg font-medium">Add a song</h2>
                <AddTrackToPlaylistForm playlistId={playlistId} guildId={guildId} />
            </section>

            <section className="rounded border bg-card p-4 text-card-foreground">
                <h2 className="mb-3 text-lg font-medium">Tracks</h2>
                <p className="mb-3 text-sm text-muted-foreground">
                    Drag tracks by the grip handle to reorder. Hover a track for details like the
                    queue.
                </p>
                {error ? (
                    <p className="mb-3 text-sm text-destructive" role="alert">
                        {error}
                    </p>
                ) : null}
                {orderedTracks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No tracks yet. Add songs above or use{" "}
                        <code className="rounded bg-muted px-1">/playlist add</code> in Discord.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {orderedTracks.map((track, index) => (
                            <PlaylistTrackRow
                                key={track.id}
                                track={track}
                                displayIndex={index + 1}
                                busy={busy}
                                isDragging={dragIndex === index}
                                isDropTarget={overIndex === index && dragIndex !== index}
                                onRemove={() => handleRemove(track.position)}
                                onDragStart={(event) => handleDragStart(index, event)}
                                onDragOver={(event) => handleDragOver(index, event)}
                                onDragLeave={() => setOverIndex(null)}
                                onDrop={(event) => handleDrop(index, event)}
                                onDragEnd={handleDragEnd}
                            />
                        ))}
                    </ul>
                )}
            </section>
        </div>
    )
}
