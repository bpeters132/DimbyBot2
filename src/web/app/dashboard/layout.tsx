import type { ReactNode } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { readSessionSafe } from "@/server/auth-session"
import { ServiceDegraded } from "@/components/ServiceDegraded"
import { UserHeader } from "@/components/UserHeader"

export default async function DashboardLayout({ children }: { children: ReactNode }) {
    const sessionResult = await readSessionSafe()

    if (sessionResult.ok === false) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <header className="border-b p-4">
                    <div className="mx-auto flex max-w-6xl items-center justify-between">
                        <Link href="/" className="font-semibold">
                            DimbyBot Dashboard
                        </Link>
                        <Link
                            href="/status"
                            className="text-sm text-muted-foreground hover:text-foreground"
                        >
                            Status
                        </Link>
                    </div>
                </header>
                <main className="mx-auto w-full max-w-6xl p-4">
                    <ServiceDegraded
                        title="Dashboard is temporarily unavailable"
                        description="We could not load your session. Usually this means the database is not running or DATABASE_URL is wrong. Fix the connection, then refresh this page."
                        detail="Please try again later or contact support if this persists."
                        supportReference={sessionResult.correlationId}
                    />
                </main>
            </div>
        )
    }

    if (!sessionResult.session?.user?.id) {
        redirect("/")
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="border-b p-4">
                <UserHeader />
            </header>
            <main className="mx-auto w-full max-w-6xl p-4">{children}</main>
        </div>
    )
}
