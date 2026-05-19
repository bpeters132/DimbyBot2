"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { getPlaylistsAction, playPlaylistInGuildAction } from "@/lib/actions/playlist.actions"
import { Button } from "@/components/ui/button"
import type { PlaylistSummary } from "@/types/web"

interface PlayPlaylistMenuProps {
    guildId: string
    requesterDiscordUserId: string | undefined
    disabled?: boolean
    onQueued?: () => void
}

export function PlayPlaylistMenu({
    guildId,
    requesterDiscordUserId,
    disabled = false,
    onQueued,
}: PlayPlaylistMenuProps) {
    const [open, setOpen] = useState(false)
    const [shuffle, setShuffle] = useState(false)
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

    const playPlaylist = async (playlist: PlaylistSummary) => {
        const requesterId = requesterDiscordUserId?.trim()
        if (!requesterId) {
            toast.error("Missing Discord user id. Refresh or sign in again.")
            return
        }
        if (playlist.trackCount === 0) {
            toast.error(`"${playlist.name}" is empty.`)
            return
        }
        setBusy(true)
        const loadingToastId = toast.loading(
            `Loading "${playlist.name}" (${playlist.trackCount} track${playlist.trackCount === 1 ? "" : "s"})…`
        )
        const result = await playPlaylistInGuildAction(
            guildId,
            playlist.id,
            requesterId,
            shuffle,
            playlist.trackCount
        )
        toast.dismiss(loadingToastId)
        setBusy(false)
        if (result.ok === false) {
            toast.error(result.error)
            return
        }
        const failNote =
            result.data.failed > 0
                ? ` (${result.data.failed} could not be resolved)`
                : ""
        toast.success(
            `Queued ${result.data.queued} from "${result.data.playlistName}"${failNote}`
        )
        setOpen(false)
        onQueued?.()
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
                Load playlist
            </Button>
            {open ? (
                <div className="absolute right-0 z-50 mt-1 min-w-[14rem] rounded border bg-popover p-2 text-popover-foreground shadow-md">
                    <label className="mb-2 flex items-center gap-2 px-1 text-sm">
                        <input
                            type="checkbox"
                            checked={shuffle}
                            onChange={(e) => setShuffle(e.target.checked)}
                            disabled={busy}
                        />
                        Shuffle
                    </label>
                    {loading ? (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</p>
                    ) : (playlists ?? []).length === 0 ? (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">
                            No playlists yet.
                        </p>
                    ) : (
                        (playlists ?? []).map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                                disabled={busy}
                                onClick={() => {
                                    void playPlaylist(p)
                                }}
                            >
                                {p.name}
                                <span className="ml-1 text-muted-foreground">({p.trackCount})</span>
                            </button>
                        ))
                    )}
                </div>
            ) : null}
        </div>
    )
}

