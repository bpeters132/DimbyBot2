"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
    addTrackToPlaylistAction,
    createPlaylistAction,
    getPlaylistsAction,
} from "@/lib/actions/playlist.actions"
import { Button } from "@/components/ui/button"
import type { PlaylistSummary } from "@/types/web"

export interface AddToPlaylistTrack {
    title: string
    uri: string
    author: string
    durationMs: number
    thumbnailUrl?: string | null
}

interface AddToPlaylistMenuProps {
    track: AddToPlaylistTrack
    disabled?: boolean
}

export function AddToPlaylistMenu({ track, disabled = false }: AddToPlaylistMenuProps) {
    const [open, setOpen] = useState(false)
    const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null)
    const [loading, setLoading] = useState(false)
    const [busy, setBusy] = useState(false)
    const rootRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        let cancelled = false
        setLoading(true)
        void getPlaylistsAction().then((result) => {
            if (cancelled) return
            setLoading(false)
            if (result.ok === true) {
                setPlaylists(result.data.playlists)
            } else {
                toast.error(result.error)
                setPlaylists([])
            }
        })
        return () => {
            cancelled = true
        }
    }, [open])

    useEffect(() => {
        if (!open) return
        const onPointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener("mousedown", onPointerDown)
        return () => document.removeEventListener("mousedown", onPointerDown)
    }, [open])

    const addToPlaylist = async (playlistId: number, playlistName: string) => {
        if (!track.uri.trim()) {
            toast.error("This track has no URL to save.")
            return
        }
        setBusy(true)
        const result = await addTrackToPlaylistAction(playlistId, {
            title: track.title,
            uri: track.uri,
            author: track.author,
            duration: track.durationMs,
            thumbnailUrl: track.thumbnailUrl ?? null,
            addedAt: new Date().toISOString(),
        })
        setBusy(false)
        if (result.ok === false) {
            toast.error(result.error)
            return
        }
        toast.success(`Added to ${playlistName}`)
        setOpen(false)
    }

    const handleCreateNew = async () => {
        const name = window.prompt("New playlist name")
        if (!name?.trim()) return
        setBusy(true)
        const created = await createPlaylistAction(name.trim())
        if (created.ok === false) {
            setBusy(false)
            toast.error(created.error)
            return
        }
        await addToPlaylist(created.data.id, created.data.name)
        setBusy(false)
        setPlaylists((prev) => [
            ...(prev ?? []),
            {
                id: created.data.id,
                name: created.data.name,
                trackCount: 1,
                totalDuration: track.durationMs,
                createdAt: created.data.createdAt,
            },
        ])
    }

    return (
        <div ref={rootRef} className="relative inline-block">
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || busy}
                onClick={() => setOpen((v) => !v)}
            >
                Add to playlist
            </Button>
            {open ? (
                <div className="absolute right-0 z-50 mt-1 min-w-[12rem] rounded border bg-popover p-1 text-popover-foreground shadow-md">
                    {loading ? (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</p>
                    ) : (
                        <>
                            {(playlists ?? []).map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                                    disabled={busy}
                                    onClick={() => {
                                        void addToPlaylist(p.id, p.name)
                                    }}
                                >
                                    {p.name}
                                </button>
                            ))}
                            <button
                                type="button"
                                className="block w-full rounded px-2 py-1.5 text-left text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                                disabled={busy}
                                onClick={() => {
                                    void handleCreateNew()
                                }}
                            >
                                Create new…
                            </button>
                        </>
                    )}
                </div>
            ) : null}
        </div>
    )
}
