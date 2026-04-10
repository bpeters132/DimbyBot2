"use client"

import Link from "next/link"
import { authClient } from "@/auth-client"
import { ModeToggle } from "@/components/ModeToggle"

async function signOutAndGoHome() {
    await authClient.signOut({
        fetchOptions: {
            onSuccess: () => {
                // Full navigation so RSC/layout re-runs with cleared cookies (client-only session clear leaves /dashboard mounted).
                window.location.assign("/")
            },
        },
    })
}

export function UserHeader() {
    const { data: session } = authClient.useSession()

    return (
        <div className="flex items-center justify-between">
            <Link href="/dashboard" prefetch={false} className="font-semibold">
                DimbyBot Dashboard
            </Link>

            <div className="flex items-center gap-3">
                <div className="text-sm text-muted-foreground">
                    {session?.user?.name ?? "Unknown user"}
                </div>
                <ModeToggle />
                {session?.user?.image ? (
                    <img
                        src={session.user.image}
                        alt="avatar"
                        className="h-8 w-8 rounded-full border"
                    />
                ) : null}
                <button
                    type="button"
                    onClick={() => void signOutAndGoHome()}
                    className="rounded border px-3 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                    Log out
                </button>
            </div>
        </div>
    )
}
