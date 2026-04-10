"use client"

import { authClient } from "@/auth-client"

export function LoginButton() {
    const onSignIn = async () => {
        await authClient.signIn.social({
            provider: "discord",
            callbackURL: "/dashboard",
        })
    }

    return (
        <button
            type="button"
            onClick={() => void onSignIn()}
            className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
        >
            Sign in with Discord
        </button>
    )
}
