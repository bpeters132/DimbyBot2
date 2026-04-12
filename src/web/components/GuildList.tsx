import Link from "next/link"
import type { GuildListActionResult } from "@/server/guild.actions"
import type { GuildListItem } from "@/types/web"

type GuildListProps = {
    result: GuildListActionResult
}

/** Accepts loose API data so a single bad row cannot crash the dashboard. */
function parseSafeGuildListItem(entry: unknown): GuildListItem | null {
    if (!entry || typeof entry !== "object") return null
    const g = entry as Record<string, unknown>
    if (typeof g.name !== "string") return null
    const id = g.id
    if (typeof id !== "string" && typeof id !== "number") return null
    const iconRaw = g.iconUrl
    const iconUrl = typeof iconRaw === "string" ? iconRaw : null
    const mc = g.memberCount
    const memberCount = typeof mc === "number" ? mc : null
    return { id: String(id), name: g.name, iconUrl, memberCount }
}

function isValidGuildIconUrl(url: string | null | undefined): url is string {
    if (typeof url !== "string") return false
    const trimmed = url.trim()
    if (!trimmed) return false
    return /^https:\/\/.+/i.test(trimmed)
}

function isValidBotInviteUrl(url: string | null | undefined): url is string {
    if (typeof url !== "string") return false
    const trimmed = url.trim()
    if (!trimmed) return false
    try {
        const u = new URL(trimmed)
        if (u.protocol !== "https:") return false
        const host = u.hostname.toLowerCase()
        return host === "discord.com" || host === "discord.gg"
    } catch {
        return false
    }
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
    const guildsList = rawList
        ? rawList.map(parseSafeGuildListItem).filter((g): g is GuildListItem => g !== null)
        : null

    if (!rawList || !guildsList) {
        return (
            <div className="rounded border bg-card p-4 text-card-foreground">
                <p>Unable to display the guild list (invalid response).</p>
            </div>
        )
    }

    if (rawList.length > 0 && guildsList.length === 0) {
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
                {isValidBotInviteUrl(data.botInviteUrl) ? (
                    <a
                        className="mt-3 inline-block rounded bg-primary px-3 py-2 text-primary-foreground no-underline hover:opacity-90"
                        href={data.botInviteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Invite bot to a server
                    </a>
                ) : null}
            </div>
        )
    }

    return (
        <div className="grid gap-3 md:grid-cols-2">
            {guildsList.map((guild) => (
                <Link
                    href={`/dashboard/${guild.id}`}
                    key={guild.id}
                    className="flex items-center gap-3 rounded border bg-card p-3 no-underline hover:bg-accent hover:text-accent-foreground"
                >
                    {isValidGuildIconUrl(guild.iconUrl) ? (
                        <img
                            src={guild.iconUrl}
                            alt={`${guild.name} icon`}
                            className="h-10 w-10 rounded-full"
                        />
                    ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                            {guild.name.slice(0, 1)}
                        </div>
                    )}
                    <div>
                        <div className="font-medium">{guild.name}</div>
                        <div className="text-sm text-muted-foreground">
                            {typeof guild.memberCount === "number"
                                ? guild.memberCount === 1
                                    ? "1 member"
                                    : `${guild.memberCount} members`
                                : "Member count unavailable"}
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    )
}
