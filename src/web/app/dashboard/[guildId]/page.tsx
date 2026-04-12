import { dashboardHasWebPermission } from "@/lib/dashboard-permissions"
import { WEB_PERMISSION } from "@/lib/web-permission-keys"
import { getGuildDashboardSnapshotAction } from "@/server/dashboard-permissions.actions"
import { PlayerPanel } from "@/components/PlayerPanel"

interface GuildPageProps {
    params: Promise<{ guildId: string }>
}

export default async function GuildPage({ params }: GuildPageProps) {
    const { guildId } = await params

    const permResult = await getGuildDashboardSnapshotAction(guildId)

    if (permResult.ok === false) {
        return (
            <section className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                <p className="font-medium text-destructive">
                    {permResult.status === 401 ? "Sign in required" : "Access denied"}
                </p>
                <p className="mt-2 text-muted-foreground">
                    {permResult.details ?? permResult.error}
                </p>
            </section>
        )
    }

    if (!dashboardHasWebPermission(permResult.snapshot, WEB_PERMISSION.VIEW_PLAYER)) {
        return (
            <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-100">
                <p className="font-medium">Player is not available for your account</p>
                <p className="mt-2 text-muted-foreground">
                    The bot is not allowing the player page for your Discord account in this server
                    (it could not confirm membership or match your login to a member). Sign in with
                    Discord and use the same account you use in this server.
                </p>
            </section>
        )
    }

    return (
        <section>
            <PlayerPanel
                guildId={guildId}
                discordUserId={permResult.discordUserId}
                permissionSnapshot={permResult.snapshot}
            />
        </section>
    )
}
