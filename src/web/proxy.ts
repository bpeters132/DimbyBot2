import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/** Lowercase and strip default ports only when they match the URL scheme (https→443, http→80). */
function normalizeHost(host: string, protocol: string): string {
    let hostPart = host.trim()
    let scheme = protocol
    const lowerInput = hostPart.toLowerCase()

    if (lowerInput.startsWith("https://") || lowerInput.startsWith("http://")) {
        const parsed = new URL(hostPart)
        hostPart = parsed.host
        scheme = parsed.protocol
    }

    let normalized = hostPart.toLowerCase()
    if (scheme === "https:" && normalized.endsWith(":443")) {
        normalized = normalized.slice(0, -4)
    } else if (scheme === "http:" && normalized.endsWith(":80")) {
        normalized = normalized.slice(0, -3)
    }
    return normalized
}

/**
 * Logs when the incoming Host does not match `BETTER_AUTH_URL` (www/scheme drift breaks OAuth cookies).
 * Does not block requests — only surfaces misconfiguration in server logs.
 */
export function proxy(request: NextRequest): NextResponse {
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

        const forwardedProto = request.headers
            .get("x-forwarded-proto")
            ?.split(",")[0]
            ?.trim()
            .toLowerCase()
        const requestProtocol =
            forwardedProto === "http"
                ? "http:"
                : forwardedProto === "https"
                  ? "https:"
                  : request.nextUrl.protocol

        const normalizedHost = host ? normalizeHost(host, requestProtocol) : null
        const normalizedExpectedHost = normalizeHost(expected.host, expected.protocol)

        if (normalizedHost && normalizedHost !== normalizedExpectedHost) {
            console.warn(
                `[proxy] Host mismatch: normalizedHost=${normalizedHost} normalizedExpectedHost=${normalizedExpectedHost} path=${request.nextUrl.pathname}`
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
