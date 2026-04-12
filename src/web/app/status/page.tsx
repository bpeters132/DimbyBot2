import Link from "next/link"
import { StatusChecker } from "@/components/StatusChecker"

export default function StatusPage() {
    return (
        <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Service status</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Basic status checks for the database and the bot API.
                    </p>
                </div>
                <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
                    Home
                </Link>
            </div>
            <StatusChecker />
        </main>
    )
}
