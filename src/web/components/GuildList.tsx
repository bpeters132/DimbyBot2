import Link from "next/link"
import type { GuildListActionResult } from "@/server/guild.actions"

type GuildListProps = {
    result: GuildListActionResult
}

/** Renders the dashboard guild list from a server-loaded result (no client-side refetch race). */
export function GuildList({ result }: GuildListProps) {
    if (!result.ok) {
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

    if (data.guilds.length === 0) {
        return (
            <div className="rounded border bg-card p-4 text-card-foreground">
                <p>The bot is not in any of your servers yet.</p>
                {data.botInviteUrl ? (
                    <a
                        className="mt-3 inline-block rounded bg-primary px-3 py-2 text-primary-foreground no-underline hover:opacity-90"
                        href={data.botInviteUrl}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Invite bot to a server
                    </a>
                ) : null}
            </div>
        )
    }

    return (
        <div className="grid gap-3 md:grid-cols-2">
            {data.guilds.map((guild) => (
                <Link
                    href={`/dashboard/${guild.id}`}
                    key={guild.id}
                    className="flex items-center gap-3 rounded border bg-card p-3 no-underline hover:bg-accent hover:text-accent-foreground"
                >
                    {guild.iconUrl ? (
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
                            {guild.memberCount
                                ? `${guild.memberCount} members`
                                : "Member count unavailable"}
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    )
}
