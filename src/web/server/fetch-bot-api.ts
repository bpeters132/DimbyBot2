import { headers } from "next/headers"
import { getBotApiOrigin } from "@/server/bot-api-origin"
import { isBotApiVerbose, logBotApiVerbose } from "@/server/bot-api-verbose"

const UPSTREAM_FETCH_TIMEOUT_MS = 10_000

/**
 * Calls the bot REST API from the Next server using the current request cookies (session).
 */
export async function serverFetchBot(
    pathnameAndSearch: string,
    options?: {
        method?: string
        body?: string
        contentType?: string
    }
): Promise<Response> {
    let origin: string | null
    try {
        origin = getBotApiOrigin()
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Invalid API_PROXY_TARGET"
        logBotApiVerbose("serverFetchBot: invalid API_PROXY_TARGET", {
            path: pathnameAndSearch,
            message,
        })
        return new Response(
            JSON.stringify({
                ok: false,
                error: {
                    error: "Bot API misconfigured",
                    details: "Bot API misconfigured",
                },
            }),
            { status: 503, headers: { "content-type": "application/json" } }
        )
    }
    if (!origin) {
        logBotApiVerbose("serverFetchBot: no origin (set API_PROXY_TARGET or use dev default)", {
            path: pathnameAndSearch,
        })
        return new Response(
            JSON.stringify({
                ok: false,
                error: {
                    error: "Bot API not configured",
                    details:
                        "Set API_PROXY_TARGET to the bot HTTP origin (e.g. http://localhost:3001).",
                },
            }),
            { status: 503, headers: { "content-type": "application/json" } }
        )
    }

    const path = pathnameAndSearch.startsWith("/") ? pathnameAndSearch : `/${pathnameAndSearch}`
    const url = `${origin}${path}`

    const incoming = await headers()
    const outHeaders = new Headers()
    const cookie = incoming.get("cookie")
    if (cookie) outHeaders.set("cookie", cookie)
    const authorization = incoming.get("authorization")
    if (authorization) outHeaders.set("authorization", authorization)

    const method = (options?.method ?? "GET").toUpperCase()
    if (options?.body != null && method !== "GET" && method !== "HEAD") {
        outHeaders.set("content-type", options.contentType ?? "application/json")
    }

    const bodyLen =
        method !== "GET" && method !== "HEAD" && options?.body != null
            ? new TextEncoder().encode(options.body).length
            : 0
    const started = Date.now()
    if (isBotApiVerbose()) {
        logBotApiVerbose("serverFetchBot → request", {
            method,
            url,
            forwardedCookie: Boolean(cookie),
            forwardedAuthorization: Boolean(authorization),
            bodyBytes: bodyLen,
        })
    }

    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
        timeoutId = setTimeout(() => controller.abort(), UPSTREAM_FETCH_TIMEOUT_MS)
        const res = await fetch(url, {
            method,
            headers: outHeaders,
            body: method !== "GET" && method !== "HEAD" ? options?.body : undefined,
            signal: controller.signal,
            cache: "no-store",
        })
        if (isBotApiVerbose()) {
            logBotApiVerbose("serverFetchBot ← response", {
                method,
                url,
                status: res.status,
                ok: res.ok,
                ms: Date.now() - started,
                contentType: res.headers.get("content-type") ?? undefined,
            })
        }
        return res
    } catch (e) {
        const message = e instanceof Error ? e.message : "Fetch failed"
        const isAbort =
            (e instanceof Error && (e.name === "AbortError" || /aborted|abort/i.test(message))) ||
            (typeof DOMException !== "undefined" &&
                e instanceof DOMException &&
                e.name === "AbortError")
        logBotApiVerbose(
            isAbort ? "serverFetchBot ✖ fetch timed out" : "serverFetchBot ✖ fetch threw",
            {
                method,
                url,
                ms: Date.now() - started,
                error: message,
            }
        )
        return new Response(
            JSON.stringify({
                ok: false,
                error: {
                    error: isAbort ? "Bot API request timed out" : "Bot API unreachable",
                    details: isAbort
                        ? "Upstream bot did not respond before the timeout."
                        : "Unable to reach Bot API",
                },
            }),
            { status: isAbort ? 504 : 502, headers: { "content-type": "application/json" } }
        )
    } finally {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId)
        }
    }
}
