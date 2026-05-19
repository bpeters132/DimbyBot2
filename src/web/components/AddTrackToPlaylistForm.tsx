"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { addTrackFromQueryToPlaylistAction } from "@/lib/actions/playlist.actions"
import { Button } from "@/components/ui/button"

interface AddTrackToPlaylistFormProps {
    playlistId: number
    /** When set, prefer Lavalink search via this guild's player. */
    guildId?: string
}

export function AddTrackToPlaylistForm({ playlistId, guildId }: AddTrackToPlaylistFormProps) {
    const router = useRouter()
    const [query, setQuery] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    return (
        <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
                e.preventDefault()
                void (async () => {
                    const trimmed = query.trim()
                    if (!trimmed) {
                        setError("Enter a song name, track URL, or playlist URL.")
                        return
                    }
                    setSubmitting(true)
                    setError(null)
                    setSuccess(null)
                    const result = await addTrackFromQueryToPlaylistAction(playlistId, {
                        query: trimmed,
                        guildId,
                    })
                    setSubmitting(false)
                    if (result.ok === false) {
                        setError(result.error)
                        return
                    }
                    setQuery("")
                    setSuccess(
                        result.data.added === 1
                            ? "Added 1 track."
                            : `Added ${result.data.added} tracks from playlist.`
                    )
                    router.refresh()
                })()
            }}
        >
            <div className="flex-1">
                <label htmlFor="add-track-query" className="mb-1 block text-sm font-medium">
                    Add song or playlist link
                </label>
                <input
                    id="add-track-query"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full rounded border bg-background px-3 py-2 text-sm"
                    placeholder="Song name, track URL, or YouTube playlist URL"
                    disabled={submitting}
                />
            </div>
            <Button type="submit" disabled={submitting}>
                {submitting ? "Adding…" : "Add"}
            </Button>
            {error ? (
                <p className="text-sm text-destructive sm:basis-full" role="alert">
                    {error}
                </p>
            ) : null}
            {success ? (
                <p className="text-sm text-green-600 dark:text-green-400 sm:basis-full" role="status">
                    {success}
                </p>
            ) : null}
        </form>
    )
}
