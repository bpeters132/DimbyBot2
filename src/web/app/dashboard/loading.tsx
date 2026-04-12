import { Loader2 } from "lucide-react"

export default function DashboardLoading() {
    return (
        <section aria-busy="true">
            <h1 className="mb-4 text-2xl font-semibold">Your Servers</h1>
            <div
                className="flex items-center gap-2 text-muted-foreground"
                role="status"
                aria-live="polite"
            >
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                <span>Loading servers...</span>
                <span className="sr-only">Loading server list, please wait.</span>
            </div>
        </section>
    )
}
