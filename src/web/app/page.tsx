import Link from "next/link"
import { redirect } from "next/navigation"
import { LoginButton } from "@/components/LoginButton"
import { readSessionSafe } from "@/server/auth-session"

export default async function HomePage() {
    const sessionResult = await readSessionSafe()
    if (sessionResult.ok && sessionResult.session?.user?.id) {
        redirect("/dashboard")
    }
    const sessionReadError = sessionResult.ok === false ? sessionResult : null

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 text-center">
            <h1 className="text-3xl font-bold">DimbyBot Dashboard</h1>
            <p className="mt-2 text-muted-foreground">
                Sign in with Discord to control music playback.
            </p>
            {sessionReadError ? (
                <div className="mt-6 w-full max-w-md rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-left text-sm">
                    <p className="font-medium text-foreground">
                        Sign-in status could not be verified
                    </p>
                    <p className="mt-2 text-muted-foreground">
                        The auth database may be offline or misconfigured. You can still try signing
                        in; if it fails, check services on the status page.
                    </p>
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                        Reference: {sessionReadError.correlationId}
                    </p>
                    <Link
                        href="/status"
                        className="mt-3 inline-block text-primary underline-offset-4 hover:underline"
                    >
                        Service status
                    </Link>
                </div>
            ) : null}
            <div className="mt-8">
                <LoginButton />
            </div>
            <p className="mt-10 text-xs text-muted-foreground">
                <Link href="/status" className="underline-offset-4 hover:underline">
                    System status
                </Link>
            </p>
        </main>
    )
}
