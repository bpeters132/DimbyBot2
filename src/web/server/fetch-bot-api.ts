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
    const origin = getBotApiOrigin()
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

    const method = options?.method ?? "GET"
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
        logBotApiVerbose("serverFetchBot ✖ fetch threw", {
            method,
            url,
            ms: Date.now() - started,
            error: message,
        })
        return new Response(
            JSON.stringify({
                ok: false,
                error: {
                    error: "Bot API unreachable",
                    details: "Unable to reach Bot API",
                },
            }),
            { status: 502, headers: { "content-type": "application/json" } }
        )
    } finally {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId)
        }
    }
}
