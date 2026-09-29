import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { resolveAuthHostAlignment } from "@/lib/auth-host-alignment.js"

/**
 * Logs when the incoming Host does not match `BETTER_AUTH_URL` (www/scheme drift breaks OAuth cookies).
 * Does not block requests — only surfaces misconfiguration in server logs.
 */
export function proxy(request: NextRequest): NextResponse {
    try {
        const alignment = resolveAuthHostAlignment({
            configuredUrl: process.env.BETTER_AUTH_URL,
            forwardedHost: request.headers.get("x-forwarded-host"),
            hostHeader: request.headers.get("host"),
            fallbackHost: request.nextUrl.host,
            forwardedProto: request.headers.get("x-forwarded-proto"),
            fallbackProtocol: request.nextUrl.protocol,
        })
        if (alignment.kind === "invalid_config") {
            console.warn("[proxy] BETTER_AUTH_URL is not a valid URL; host alignment check skipped")
        } else if (alignment.kind === "mismatch") {
            console.warn(
                `[proxy] Host mismatch: normalizedHost=${alignment.normalizedHost} normalizedExpectedHost=${alignment.normalizedExpectedHost} path=${request.nextUrl.pathname}`
            )
        }
    } catch {
        console.warn("[proxy] BETTER_AUTH_URL is not a valid URL; host alignment check skipped")
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    ],
}
