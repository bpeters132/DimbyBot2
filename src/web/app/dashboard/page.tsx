import { GuildList } from "@/components/GuildList"
import { loadGuildListForDashboard } from "@/server/guild.actions"

export default async function DashboardPage() {
    const result = await loadGuildListForDashboard()

    return (
        <section>
            <h1 className="mb-4 text-2xl font-semibold">Your Servers</h1>
            <GuildList result={result} />
        </section>
    )
}
