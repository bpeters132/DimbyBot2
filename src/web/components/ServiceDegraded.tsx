import Link from "next/link"

type ServiceDegradedProps = {
    title: string
    description: string
    detail?: string
    /** Shown in all environments (e.g. session load correlation id for support). */
    supportReference?: string
}

/** Shown when auth/session or another dependency fails instead of erroring the whole segment. */
export function ServiceDegraded({
    title,
    description,
    detail,
    supportReference,
}: ServiceDegradedProps) {
    const detailForRender = !detail
        ? undefined
        : process.env.NODE_ENV === "production"
          ? "Technical details hidden."
          : detail
                .replace(/https?:\/\/[^\s"'<>]+/gi, "[url]")
                .replace(/[A-Z]:\\[^\s]+/g, "[path]")
                .replace(
                    /(^|[\s"'(>])(\/(?:etc|var|tmp|usr|home|opt|root|app|proc)\b(?:\/[\w.-]+)+)/gi,
                    "$1[path]"
                )
                .replace(/(^|[\s"'(>])(\.{1,2}\/(?:[\w.-]+\/)*[\w.-]+)/g, "$1[path]")
                .replace(/\b[A-Z_]*ERROR_[A-Z_0-9]+\b/g, "[error-code]")
                .slice(0, 300)

    return (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-left">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            {supportReference ? (
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                    Reference: {supportReference}
                </p>
            ) : null}
            {detailForRender ? (
                <pre className="mt-4 max-h-40 overflow-auto rounded bg-muted/50 p-3 text-xs text-muted-foreground">
                    {detailForRender}
                </pre>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
                <Link
                    href="/status"
                    className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground no-underline hover:opacity-90"
                >
                    Check service status
                </Link>
                <Link
                    href="/"
                    className="inline-flex items-center rounded-md border px-4 py-2 text-sm no-underline hover:bg-accent hover:text-accent-foreground"
                >
                    Home
                </Link>
            </div>
        </div>
    )
}
