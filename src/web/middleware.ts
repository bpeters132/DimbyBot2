import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/** Lowercase and strip default HTTP(S) ports so `Host` and `BETTER_AUTH_URL` compare consistently. */
function normalizeHost(host: string): string {
    let normalized = host.trim().toLowerCase()
    if (normalized.endsWith(":443")) {
        normalized = normalized.slice(0, -4)
    } else if (normalized.endsWith(":80")) {
        normalized = normalized.slice(0, -3)
    }
    return normalized
}

/**
 * Logs when the incoming Host does not match `BETTER_AUTH_URL` (www/scheme drift breaks OAuth cookies).
 * Does not block requests — only surfaces misconfiguration in server logs.
 */
export function middleware(request: NextRequest): NextResponse {
    const configuredUrl = process.env.BETTER_AUTH_URL?.trim()
    if (!configuredUrl) {
        return NextResponse.next()
    }

    try {
        const expected = new URL(configuredUrl)
        const forwardedHost = request.headers.get("x-forwarded-host")
        const host =
            forwardedHost?.split(",")[0]?.trim() ||
            request.headers.get("host")?.trim() ||
            request.nextUrl.host

        const normalizedHost = host ? normalizeHost(host) : null
        const normalizedExpectedHost = normalizeHost(expected.host)

        if (normalizedHost && normalizedHost !== normalizedExpectedHost) {
            console.warn(
                `[middleware] Host mismatch: normalizedHost=${normalizedHost} normalizedExpectedHost=${normalizedExpectedHost} path=${request.nextUrl.pathname}`
            )
        }
    } catch {
        console.warn(
            "[middleware] BETTER_AUTH_URL is not a valid URL; host alignment check skipped"
        )
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    ],
}
