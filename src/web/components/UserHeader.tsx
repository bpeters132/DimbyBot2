"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { authClient } from "@/auth-client"
import { ModeToggle } from "@/components/ModeToggle"

async function signOutAndGoHome(): Promise<void> {
    const result = await authClient.signOut()
    if (result?.error) {
        throw new Error(result.error.message || "Sign out failed")
    }
    // Full navigation so RSC/layout re-runs with cleared cookies (client-only session clear leaves /dashboard mounted).
    window.location.assign("/")
}

export function UserHeader() {
    const { data: session } = authClient.useSession()
    const [signOutError, setSignOutError] = useState<string | null>(null)
    const [signOutLoading, setSignOutLoading] = useState(false)
    const signOutInFlight = useRef(false)

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
                    <Image
                        src={session.user.image}
                        alt="avatar"
                        width={32}
                        height={32}
                        className="rounded-full border"
                    />
                ) : null}
                <button
                    type="button"
                    aria-busy={signOutLoading}
                    disabled={signOutLoading}
                    onClick={() => {
                        void (async () => {
                            if (signOutInFlight.current) return
                            signOutInFlight.current = true
                            setSignOutError(null)
                            setSignOutLoading(true)
                            try {
                                await signOutAndGoHome()
                            } catch (error) {
                                console.error("[UserHeader] sign out failed", error)
                                setSignOutError("Log out failed. Please try again.")
                                signOutInFlight.current = false
                                setSignOutLoading(false)
                            }
                        })()
                    }}
                    className="rounded border px-3 py-1 text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                >
                    {signOutLoading ? "Signing out…" : "Log out"}
                </button>
                {signOutError ? (
                    <span className="text-xs text-destructive" role="alert" aria-live="assertive">
                        {signOutError}
                    </span>
                ) : null}
            </div>
        </div>
    )
}
