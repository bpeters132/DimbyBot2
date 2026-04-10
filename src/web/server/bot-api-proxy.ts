import { NextResponse } from "next/server"
import { getBotApiOrigin } from "@/server/bot-api-origin"
import { isBotApiVerbose, logBotApiVerbose } from "@/server/bot-api-verbose"

/**
 * Forwards the request to the bot HTTP server (Express on WEB_PORT).
 * Next/Turbopack cannot reliably bundle `src/botApi` (outside this app); the bot process owns that logic.
 */
export async function proxyBotApi(request: Request): Promise<NextResponse> {
    const origin = getBotApiOrigin()
    if (!origin) {
        logBotApiVerbose("proxyBotApi: no origin", {
            pathname: new URL(request.url).pathname,
        })
        return NextResponse.json(
            {
                ok: false,
                error: {
                    error: "Bot API not configured",
                    details:
                        "Set API_PROXY_TARGET to the bot HTTP origin (e.g. http://localhost:3001).",
                },
            },
            { status: 503 }
        )
    }

    const incoming = new URL(request.url)
    const targetUrl = `${origin}${incoming.pathname}${incoming.search}`

    const headers = new Headers()
    for (const name of ["cookie", "authorization", "content-type"] as const) {
        const value = request.headers.get(name)
        if (value) headers.set(name, value)
    }

    const method = request.method
    const init: RequestInit = {
        method,
        headers,
    }

    if (method !== "GET" && method !== "HEAD") {
        init.body = await request.arrayBuffer()
    }

    const started = Date.now()
    const forwardCookie = Boolean(request.headers.get("cookie"))
    const forwardAuth = Boolean(request.headers.get("authorization"))
    if (isBotApiVerbose()) {
        logBotApiVerbose("proxyBotApi → upstream", {
            method,
            targetUrl,
            forwardedCookie: forwardCookie,
            forwardedAuth: forwardAuth,
            bodyBytes: init.body && init.body instanceof ArrayBuffer ? init.body.byteLength : 0,
        })
    }

    try {
        const upstream = await fetch(targetUrl, init)
        const contentType = upstream.headers.get("content-type") || "application/json"
        const body = await upstream.arrayBuffer()
        if (isBotApiVerbose()) {
            logBotApiVerbose("proxyBotApi ← upstream", {
                method,
                targetUrl,
                status: upstream.status,
                ok: upstream.ok,
                ms: Date.now() - started,
                responseBytes: body.byteLength,
                contentType,
            })
        }
        return new NextResponse(body, {
            status: upstream.status,
            headers: { "content-type": contentType },
        })
    } catch (e) {
        const message = e instanceof Error ? e.message : "Fetch failed"
        logBotApiVerbose("proxyBotApi ✖ fetch threw", {
            method,
            targetUrl,
            ms: Date.now() - started,
            error: message,
        })
        return NextResponse.json(
            {
                ok: false,
                error: {
                    error: "Bot API unreachable",
                    details: message,
                },
            },
            { status: 502 }
        )
    }
}
