import { Loader2 } from "lucide-react"

export default function DashboardLoading() {
    return (
        <section className="space-y-4" aria-busy="true">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Your Servers</h1>
            <div
                className="flex items-center gap-2 text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
            >
                <Loader2
                    className="size-5 shrink-0 animate-spin text-muted-foreground"
                    aria-hidden="true"
                />
                <span>Loading servers…</span>
                <span className="sr-only">Loading server list, please wait.</span>
            </div>
        </section>
    )
}
