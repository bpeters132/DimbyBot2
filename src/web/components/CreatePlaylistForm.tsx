"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { createPlaylistAction } from "@/lib/actions/playlist.actions"
import { Button } from "@/components/ui/button"

export function CreatePlaylistForm() {
    const router = useRouter()
    const [name, setName] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    return (
        <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
                e.preventDefault()
                void (async () => {
                    const trimmed = name.trim()
                    if (!trimmed) {
                        setError("Enter a playlist name.")
                        return
                    }
                    setSubmitting(true)
                    setError(null)
                    const result = await createPlaylistAction(trimmed)
                    setSubmitting(false)
                    if (result.ok === false) {
                        setError(result.error)
                        return
                    }
                    setName("")
                    router.refresh()
                })()
            }}
        >
            <div className="flex-1">
                <label htmlFor="playlist-name" className="mb-1 block text-sm font-medium">
                    New playlist name
                </label>
                <input
                    id="playlist-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded border bg-background px-3 py-2 text-sm"
                    placeholder="My favorites"
                    disabled={submitting}
                />
            </div>
            <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create Playlist"}
            </Button>
            {error ? (
                <p className="text-sm text-destructive sm:basis-full" role="alert">
                    {error}
                </p>
            ) : null}
        </form>
    )
}
