import { headers } from "next/headers"
import { resolveBotApiFetchFailure } from "@/lib/bot-api-fetch-failure"
import {
    mapServerFetchBotOriginFailure,
    type ServerFetchBotOriginFailureKind,
} from "@/lib/bot-api-origin-failure"
import { resolveFetchTimeoutMs } from "@/lib/bot-api-timeout"
import { getBotApiOrigin } from "@/server/bot-api-origin"
import { isBotApiVerbose, logBotApiVerbose } from "@/server/bot-api-verbose"
import { getOriginFallback } from "@/server/origin-fallback"

/**
 * Calls the bot REST API from the Next server using the current request cookies (session).
 */

function serverFetchBotOriginFailureResponse(kind: ServerFetchBotOriginFailureKind): Response {
    const failure = mapServerFetchBotOriginFailure(kind)
    return new Response(JSON.stringify(failure.body), {
        status: failure.status,
        headers: { "content-type": "application/json" },
    })
}

export async function serverFetchBot(
    pathnameAndSearch: string,
    options?: {
        method?: string
        body?: string
        contentType?: string
        /** Override default 10s timeout (e.g. large playlist queue loads). */
        timeoutMs?: number
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
        return serverFetchBotOriginFailureResponse("invalid")
    }
    if (!origin) {
        logBotApiVerbose("serverFetchBot: no origin (set API_PROXY_TARGET or use dev default)", {
            path: pathnameAndSearch,
        })
        return serverFetchBotOriginFailureResponse("unset")
    }

    const path = pathnameAndSearch.startsWith("/") ? pathnameAndSearch : `/${pathnameAndSearch}`
    const url = `${origin}${path}`

    const incoming = await headers()
    const outHeaders = new Headers()
    const cookie = incoming.get("cookie")
    if (cookie) outHeaders.set("cookie", cookie)
    const authorization = incoming.get("authorization")
    if (authorization) outHeaders.set("authorization", authorization)
    const requestOrigin = incoming.get("origin")
    if (requestOrigin) {
        outHeaders.set("origin", requestOrigin)
    } else {
        const fallbackOrigin = getOriginFallback()
        if (fallbackOrigin) outHeaders.set("origin", fallbackOrigin)
    }

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
        timeoutId = setTimeout(() => controller.abort(), resolveFetchTimeoutMs(options?.timeoutMs))
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
        const failure = resolveBotApiFetchFailure(e)
        const message = e instanceof Error ? e.message : "Fetch failed"
        logBotApiVerbose(
            failure.kind === "timeout"
                ? "serverFetchBot ✖ fetch timed out"
                : "serverFetchBot ✖ fetch threw",
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
                    error: failure.error,
                    details: failure.details,
                },
            }),
            { status: failure.status, headers: { "content-type": "application/json" } }
        )
    } finally {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId)
        }
    }
}
