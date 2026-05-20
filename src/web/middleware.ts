import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

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

        if (host && host !== expected.host) {
            console.warn(
                `[middleware] Host mismatch: requestHost=${host} BETTER_AUTH_URL host=${expected.host} path=${request.nextUrl.pathname}`
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
