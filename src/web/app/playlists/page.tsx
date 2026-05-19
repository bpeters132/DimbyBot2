import Link from "next/link"
import { getPlaylistsAction } from "@/lib/actions/playlist.actions"
import { CreatePlaylistForm } from "@/components/CreatePlaylistForm"
import { PlaylistDiscordHelp } from "@/components/PlaylistDiscordHelp"
import { formatDurationMs } from "@/lib/format-duration"

export const dynamic = "force-dynamic"

export default async function PlaylistsPage() {
    const result = await getPlaylistsAction()

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">Your Playlists</h1>
                <p className="text-sm text-muted-foreground">
                    Personal playlists follow your Discord account across servers.
                </p>
            </div>

            <section className="rounded border bg-card p-4 text-card-foreground">
                <h2 className="mb-3 text-lg font-medium">Create Playlist</h2>
                <CreatePlaylistForm />
            </section>

            <PlaylistDiscordHelp />

            {result.ok === false ? (
                <div className="rounded border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    {result.error}
                </div>
            ) : result.data.playlists.length === 0 ? (
                <div className="rounded border bg-card p-4 text-card-foreground">
                    <p>You do not have any playlists yet. Create one above or use</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        <code className="rounded bg-muted px-1">/playlist create</code> in Discord.
                    </p>
                </div>
            ) : (
                <div className="grid gap-3 md:grid-cols-2">
                    {result.data.playlists.map((playlist) => (
                        <Link
                            key={playlist.id}
                            href={`/playlists/${playlist.id}`}
                            className="block rounded border bg-card p-4 no-underline hover:bg-accent hover:text-accent-foreground"
                        >
                            <div className="font-semibold">{playlist.name}</div>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {playlist.trackCount} track
                                {playlist.trackCount === 1 ? "" : "s"} ·{" "}
                                {formatDurationMs(playlist.totalDuration)}
                            </p>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
