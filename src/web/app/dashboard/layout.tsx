import type { ReactNode } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { readSessionSafe } from "@/server/auth-session"
import { DashboardInviteLink } from "@/components/DashboardInviteLink"
import { ServiceDegraded } from "@/components/ServiceDegraded"
import { UserHeader } from "@/components/UserHeader"

/** Session read uses `headers()`; avoid any static/CDN caching of personalized HTML. */
export const dynamic = "force-dynamic"

/** Dashboard layout wrapper: shared header, invite link, and session gate for dashboard routes. */
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
                        description="We could not load your session. Please try again later."
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
                <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <UserHeader />
                    </div>
                    <DashboardInviteLink />
                </div>
            </header>
            <main className="mx-auto w-full max-w-6xl p-4">{children}</main>
        </div>
    )
}
