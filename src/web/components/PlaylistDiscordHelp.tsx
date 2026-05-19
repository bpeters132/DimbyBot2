/** Reminds users that playlist queueing is also available as a Discord slash command. */
export function PlaylistDiscordHelp() {
    return (
        <p className="text-sm text-muted-foreground">
            In Discord, use the bot slash command{" "}
            <code className="rounded bg-muted px-1">/playlist play</code> with the{" "}
            <code className="rounded bg-muted px-1">name</code> option to queue a saved playlist
            (optional <code className="rounded bg-muted px-1">shuffle</code>). Other subcommands:{" "}
            <code className="rounded bg-muted px-1">create</code>,{" "}
            <code className="rounded bg-muted px-1">add</code>,{" "}
            <code className="rounded bg-muted px-1">list</code>,{" "}
            <code className="rounded bg-muted px-1">view</code>,{" "}
            <code className="rounded bg-muted px-1">remove</code>,{" "}
            <code className="rounded bg-muted px-1">delete</code>.
        </p>
    )
}
