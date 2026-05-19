import Link from "next/link"
import { notFound } from "next/navigation"
import { getPlaylistAction } from "@/lib/actions/playlist.actions"
import { PlaylistTrackList } from "@/components/PlaylistTrackList"
import type { PlaylistTrackData } from "@/types/web"

export const dynamic = "force-dynamic"

type PageProps = {
    params: Promise<{ playlistId: string }>
    searchParams: Promise<{ guildId?: string }>
}

function parseTracks(raw: unknown): PlaylistTrackData[] {
    if (!Array.isArray(raw)) return []
    return raw
        .map((entry) => {
            if (!entry || typeof entry !== "object") return null
            const t = entry as Record<string, unknown>
            const id = typeof t.id === "number" ? t.id : null
            const position = typeof t.position === "number" ? t.position : null
            const duration = typeof t.duration === "number" ? t.duration : null
            const title = typeof t.title === "string" ? t.title : null
            const uri = typeof t.uri === "string" ? t.uri : null
            const author = typeof t.author === "string" ? t.author : null
            const thumbnailUrl =
                typeof t.thumbnailUrl === "string" && t.thumbnailUrl.trim()
                    ? t.thumbnailUrl.trim()
                    : null
            if (
                id === null ||
                position === null ||
                duration === null ||
                !title ||
                !uri ||
                author === null
            ) {
                return null
            }
            const addedAt =
                t.addedAt instanceof Date
                    ? t.addedAt
                    : typeof t.addedAt === "string"
                      ? new Date(t.addedAt)
                      : new Date()
            return {
                id,
                title,
                uri,
                author,
                duration,
                thumbnailUrl,
                addedAt,
                position,
            }
        })
        .filter((t): t is PlaylistTrackData => t !== null)
}

export default async function PlaylistDetailPage({ params, searchParams }: PageProps) {
    const { playlistId: playlistIdParam } = await params
    const { guildId } = await searchParams
    const guildIdTrimmed =
        typeof guildId === "string" && /^\d+$/.test(guildId.trim()) ? guildId.trim() : undefined
    if (!/^\d+$/.test(playlistIdParam)) {
        notFound()
    }
    const playlistId = Number.parseInt(playlistIdParam, 10)
    if (!Number.isFinite(playlistId) || playlistId < 1) {
        notFound()
    }

    const result = await getPlaylistAction(playlistId)
    if (result.ok === false) {
        return (
            <div className="space-y-4">
                <p className="text-destructive">{result.error}</p>
                <Link href="/playlists" className="text-primary underline-offset-4 hover:underline">
                    Back to playlists
                </Link>
            </div>
        )
    }

    const playlist = result.data
    const tracks = parseTracks(playlist.tracks)

    return (
        <PlaylistTrackList
            playlistId={playlist.id}
            playlistName={playlist.name}
            tracks={tracks}
            guildId={guildIdTrimmed}
        />
    )
}
