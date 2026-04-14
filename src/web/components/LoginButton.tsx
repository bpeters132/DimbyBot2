"use client"

import { useState } from "react"
import { authClient } from "@/auth-client"
import { toast } from "sonner"

export function LoginButton() {
    const [isSigning, setIsSigning] = useState(false)
    const onSignIn = async () => {
        if (isSigning) return
        setIsSigning(true)
        try {
            await authClient.signIn.social({
                provider: "discord",
                callbackURL: "/dashboard",
            })
        } catch (err: unknown) {
            const name = err instanceof Error ? err.name : "Error"
            const message = err instanceof Error ? err.message : String(err)
            console.error("[LoginButton] Discord sign-in failed", name, message)
            toast.error("Sign-in failed. Please try again.")
        } finally {
            setIsSigning(false)
        }
    }

    return (
        <button
            type="button"
            disabled={isSigning}
            onClick={() => void onSignIn()}
            className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
        >
            Sign in with Discord
        </button>
    )
}
