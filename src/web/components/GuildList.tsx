import Image from "next/image"
import Link from "next/link"
import type { GuildListActionResult } from "@/server/guild.actions"
import type { GuildListItem, GuildListPlayerSummary } from "@/types/web"
import { isValidGuildIconUrl, parseSafeGuildListItem } from "@/shared/guild-list-parse"

type GuildListProps = {
    result: GuildListActionResult
}

function memberCountLabel(memberCount: number | null): string {
    if (typeof memberCount === "number") {
        return memberCount === 1 ? "1 member" : `${memberCount} members`
    }
    return "Member count unavailable"
}

function playerStatusLabel(player: GuildListPlayerSummary): string {
    if (player.status === "playing") return "Playing"
    if (player.status === "paused") return "Paused"
    return "Idle"
}

function playerActivityLine(player: GuildListPlayerSummary): string {
    const status = playerStatusLabel(player)
    if (player.currentTrackTitle) {
        const byArtist = player.currentTrackAuthor
            ? `${player.currentTrackTitle} — ${player.currentTrackAuthor}`
            : player.currentTrackTitle
        return `${status} · ${byArtist}`
    }
    if (player.queueCount > 0) {
        return `${status} · ${player.queueCount} queued`
    }
    if (player.botInVoiceChannel) {
        return `${status} · In voice`
    }
    return status
}

/** Renders the dashboard guild list from a server-loaded result (no client-side refetch race). */
export function GuildList({ result }: GuildListProps) {
    if (result.ok === false) {
        return (
            <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
                <p className="text-destructive">{result.error}</p>
                <Link href="/status" className="text-primary underline-offset-4 hover:underline">
                    Check service status
                </Link>
            </div>
        )
    }

    const { data } = result
    const guilds = data.guilds
    const rawList = Array.isArray(guilds) ? guilds : null
    const guildsList =
        rawList?.map(parseSafeGuildListItem).filter((g): g is GuildListItem => g !== null) ?? []

    if (!rawList || (rawList.length > 0 && guildsList.length === 0)) {
        return (
            <div className="rounded border bg-card p-4 text-card-foreground">
                <p>Unable to display the guild list (invalid response).</p>
            </div>
        )
    }

    if (guildsList.length === 0) {
        return (
            <div className="rounded border bg-card p-4 text-card-foreground">
                <p>The bot is not in any of your servers yet.</p>
                <p className="mt-2 text-sm text-muted-foreground">
                    Use <strong>Add bot to a server</strong> in the header to invite it to another
                    server you manage.
                </p>
            </div>
        )
    }

    return (
        <div className="grid gap-3 md:grid-cols-2">
            {guildsList.map((guild) => (
                <Link
                    href={`/dashboard/${guild.id}`}
                    key={guild.id}
                    className="flex items-start gap-3 rounded border bg-card p-3 no-underline hover:bg-accent hover:text-accent-foreground"
                >
                    {isValidGuildIconUrl(guild.iconUrl) ? (
                        <Image
                            src={guild.iconUrl}
                            alt={`${guild.name} icon`}
                            width={40}
                            height={40}
                            className="h-10 w-10 shrink-0 rounded-full"
                        />
                    ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                            {guild.name.slice(0, 1)}
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{guild.name}</span>
                            {guild.player?.inVoiceWithBot ? (
                                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary">
                                    In your channel
                                </span>
                            ) : null}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {memberCountLabel(guild.memberCount)}
                        </p>
                        {guild.player ? (
                            <p className="truncate text-sm text-foreground/90">
                                {playerActivityLine(guild.player)}
                            </p>
                        ) : (
                            <p className="text-sm text-muted-foreground">No active player</p>
                        )}
                    </div>
                </Link>
            ))}
        </div>
    )
}
