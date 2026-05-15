import { ErrorsList } from "./ErrorsList.js"

/** Admin error history page. */
export default function AdminErrorsPage() {
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Error history</h1>
                <p className="text-sm text-muted-foreground">
                    Recent warn and error log lines captured in memory (newest first).
                </p>
            </div>
            <ErrorsList />
        </div>
    )
}
