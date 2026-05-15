import type { ReactNode } from "react"
import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { resolveAdminAccess } from "@/lib/admin-access"
import { ServiceDegraded } from "@/components/ServiceDegraded"

export const dynamic = "force-dynamic"

const navLinkClass =
    "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"

/** Admin section layout: owner gate and sub-navigation. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
    const h = await headers()
    const result = await resolveAdminAccess(new Headers(h))

    if (result.ok === false) {
        if (result.status === 503) {
            return (
                <div className="min-h-screen bg-background text-foreground">
                    <header className="border-b p-4">
                        <div className="mx-auto flex max-w-6xl items-center justify-between">
                            <Link href="/" className="font-semibold">
                                DimbyBot Admin
                            </Link>
                        </div>
                    </header>
                    <main className="mx-auto w-full max-w-6xl p-4">
                        <ServiceDegraded
                            title="Admin is temporarily unavailable"
                            description="We could not load your session. Please try again later."
                            detail={result.details}
                        />
                    </main>
                </div>
            )
        }
        redirect("/?error=admin_required")
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="border-b p-4">
                <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <Link href="/admin" className="font-semibold">
                            DimbyBot Admin
                        </Link>
                        <p className="text-sm text-muted-foreground">Developer tools</p>
                    </div>
                    <nav className="flex flex-wrap gap-1">
                        <Link href="/admin" className={navLinkClass}>
                            Overview
                        </Link>
                        <Link href="/admin/errors" className={navLinkClass}>
                            Errors
                        </Link>
                        <Link href="/admin/database" className={navLinkClass}>
                            Database
                        </Link>
                        <Link href="/dashboard" className={navLinkClass}>
                            Dashboard
                        </Link>
                    </nav>
                </div>
            </header>
            <main className="mx-auto w-full max-w-6xl p-4">{children}</main>
        </div>
    )
}
