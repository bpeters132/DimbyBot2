import { getDiscordBotInviteUrl } from "@/lib/discord-bot-invite"

const linkClassName =
    "inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground no-underline shadow hover:opacity-90"

/**
 * OAuth "add bot" control for the dashboard header. Uses `CLIENT_ID` from the Next server
 * environment (same Discord application as sign-in). If it is unset, shows a disabled-style hint
 * so the slot stays visible.
 */
export function DashboardInviteLink() {
    const href = getDiscordBotInviteUrl()
    if (!href) {
        return (
            <span
                className="max-w-[14rem] shrink-0 text-right text-xs leading-snug text-muted-foreground"
                title="Set CLIENT_ID in the dashboard environment (e.g. src/web/.env) to enable the invite link."
            >
                Add bot: set <code className="rounded bg-muted px-1">CLIENT_ID</code> for this app
            </span>
        )
    }
    return (
        <a className={linkClassName} href={href} target="_blank" rel="noopener noreferrer">
            Add bot to a server
        </a>
    )
}
