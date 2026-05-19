import Image from "next/image"
import Link from "next/link"
import type { GuildListActionResult } from "@/server/guild.actions"
import type { GuildListItem, GuildListPlayerSummary } from "@/types/web"

type GuildListProps = {
    result: GuildListActionResult
}

function parsePlayerSummary(raw: unknown): GuildListPlayerSummary | null {
    if (!raw || typeof raw !== "object") return null
    const p = raw as Record<string, unknown>
    const status = p.status
    if (status !== "playing" && status !== "paused" && status !== "idle") return null
    const queueCount = p.queueCount
    if (typeof queueCount !== "number" || !Number.isFinite(queueCount) || queueCount < 0) {
        return null
    }
    const title =
        typeof p.currentTrackTitle === "string" && p.currentTrackTitle.trim()
            ? p.currentTrackTitle.trim()
            : null
    const author =
        typeof p.currentTrackAuthor === "string" && p.currentTrackAuthor.trim()
            ? p.currentTrackAuthor.trim()
            : null
    const botInVoiceChannel = p.botInVoiceChannel === true || p.botInVoiceChannel === "true"
    const inVoiceWithBot = p.inVoiceWithBot === true || p.inVoiceWithBot === "true"
    return {
        status,
        botInVoiceChannel,
        inVoiceWithBot,
        currentTrackTitle: title,
        currentTrackAuthor: author,
        queueCount: Math.floor(queueCount),
    }
}

/** Accepts loose API data so a single bad row cannot crash the dashboard. */
function parseSafeGuildListItem(entry: unknown): GuildListItem | null {
    if (!entry || typeof entry !== "object") return null
    const g = entry as Record<string, unknown>
    if (typeof g.name !== "string" || g.name.trim().length === 0) return null
    const name = g.name.trim()
    const idRaw = g.id
    if (typeof idRaw !== "string") return null
    const idStr = idRaw.trim()
    if (!/^\d+$/.test(idStr)) return null
    const iconRaw = g.iconUrl
    const iconUrl = typeof iconRaw === "string" ? iconRaw.trim() : null
    const mc = g.memberCount
    const memberCount = typeof mc === "number" && Number.isInteger(mc) && mc >= 0 ? mc : null
    const player =
        g.player === null || g.player === undefined ? null : parsePlayerSummary(g.player)
    return { id: idStr, name, iconUrl, memberCount, player }
}

function isValidGuildIconUrl(url: string | null | undefined): url is string {
    if (typeof url !== "string") return false
    const trimmed = url.trim()
    if (!trimmed) return false
    return /^https:\/\/(?:cdn\.discordapp\.com|images\.discordapp\.net)(?:\/|$)/i.test(trimmed)
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
                        <p className="text-sm text-muted-foreground">{memberCountLabel(guild.memberCount)}</p>
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
