import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { LoginButton } from "@/components/LoginButton"
import { readSessionSafe, type SessionReadFailureKind } from "@/server/auth-session"

/** Session read uses `headers()`; avoid any static/CDN caching of personalized HTML. */
export const dynamic = "force-dynamic"

function readPublicOrigin(): string | null {
    const configured = process.env.BETTER_AUTH_URL?.trim()
    if (configured) {
        try {
            return new URL(configured).origin
        } catch {
            // fall through to request headers
        }
    }
    return null
}

function readRequestOrigin(h: Headers): string {
    const configured = readPublicOrigin()
    if (configured) return configured

    const forwardedHost = h.get("x-forwarded-host")?.split(",")[0]?.trim()
    const host = forwardedHost || h.get("host")?.trim()
    if (!host) return "this site"

    const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https"
    return `${proto}://${host}`
}

function sessionFailureHint(kind: SessionReadFailureKind): string {
    switch (kind) {
        case "database_connectivity":
            return "The app could not reach PostgreSQL (connection refused, timeout, or DNS). Confirm the dashboard container shares the Compose network with postgres-db and that DATABASE_URL points at postgres-db:5432 from inside Docker."
        case "database_schema":
            return "The database responded but expected tables are missing. Ensure Prisma migrations have been applied (the bot runs migrate deploy on startup when its database connection succeeds)."
        case "auth_configuration":
            return "Session or token handling failed (often BETTER_AUTH_SECRET differs between dimbybot and dimbybot-web, or cookies were issued by another environment). Align BETTER_AUTH_SECRET across both containers and clear site cookies for this domain."
        default:
            return "Check dimbybot-web logs for the correlation id below (search for [auth-session]). Open Service status to see whether the database probe succeeds independently of sign-in."
    }
}

export default async function HomePage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; error_description?: string }>
}) {
    const params = await searchParams
    if (params.error?.trim()) {
        const qs = new URLSearchParams({ error: params.error.trim() })
        const description = params.error_description?.trim()
        if (description) qs.set("error_description", description)
        redirect(`/auth/error?${qs.toString()}`)
    }

    const sessionResult = await readSessionSafe()
    if (sessionResult.ok && sessionResult.session?.user?.id) {
        redirect("/dashboard")
    }
    const sessionReadError = sessionResult.ok === false ? sessionResult : null
    const h = await headers()
    const publicOrigin = readRequestOrigin(h)

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 text-center">
            <h1 className="text-3xl font-bold">DimbyBot Dashboard</h1>
            <p className="mt-2 text-muted-foreground">
                Sign in with Discord to control music playback.
            </p>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
                You&apos;ll be redirected to{" "}
                <strong className="text-foreground">discord.com</strong> to authorize DimbyBot. This
                app never sees your Discord password.
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{publicOrigin}</p>
            {sessionReadError ? (
                <div className="mt-6 w-full max-w-md rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-left text-sm">
                    <p className="font-medium text-foreground">
                        Sign-in status could not be verified
                    </p>
                    <p className="mt-2 text-muted-foreground">
                        The auth database may be offline or misconfigured. You can still try signing
                        in; if it fails, check services on the status page.
                    </p>
                    <p className="mt-3 text-muted-foreground">
                        {sessionFailureHint(sessionReadError.failureKind)}
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
