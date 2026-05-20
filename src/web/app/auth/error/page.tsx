import type { Metadata } from "next"
import Link from "next/link"
import { authErrorMessage } from "@/lib/auth-error-message"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Sign-in error — DimbyBot Dashboard",
    description: "Discord OAuth sign-in could not be completed.",
}

type AuthErrorPageProps = {
    searchParams: Promise<{ error?: string; error_description?: string }>
}

/** Shown when Discord OAuth or Better Auth fails — intentionally not a login form. */
export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
    const { error, error_description } = await searchParams
    const message = authErrorMessage(error)
    const detail =
        error_description?.trim() &&
        error_description.trim().toLowerCase() !== error?.trim().toLowerCase()
            ? error_description.trim()
            : null

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-6 text-center">
            <h1 className="text-2xl font-bold">Sign-in could not be completed</h1>
            <p className="mt-3 text-muted-foreground">{message}</p>
            {detail ? <p className="mt-2 text-sm text-muted-foreground">{detail}</p> : null}
            {error ? (
                <p className="mt-4 font-mono text-xs text-muted-foreground">Code: {error}</p>
            ) : null}
            <p className="mt-8 text-sm text-muted-foreground">
                Return to the{" "}
                <Link href="/" className="text-primary underline-offset-4 hover:underline">
                    DimbyBot Dashboard home page
                </Link>{" "}
                to start sign-in again. You will be sent to{" "}
                <strong className="text-foreground">discord.com</strong> — this site never asks for
                your Discord password.
            </p>
            <Link
                href="/status"
                className="mt-6 text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
                System status
            </Link>
        </main>
    )
}
