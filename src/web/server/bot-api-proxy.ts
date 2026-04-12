import { NextResponse } from "next/server"
import { getBotApiOrigin } from "@/server/bot-api-origin"
import { isBotApiVerbose, logBotApiVerbose } from "@/server/bot-api-verbose"

function readBotApiProxyTimeoutMs(): number {
    const raw = process.env.BOT_API_PROXY_TIMEOUT_MS?.trim()
    if (!raw) return 4000
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 1) return 4000
    return Math.min(Math.max(n, 1000), 120_000)
}

/**
 * Forwards the request to the bot HTTP server (Express on WEB_PORT).
 * Next/Turbopack cannot reliably bundle `src/botApi` (outside this app); the bot process owns that logic.
 */
export async function proxyBotApi(request: Request): Promise<NextResponse> {
    let origin: string | null
    try {
        origin = getBotApiOrigin()
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Invalid API_PROXY_TARGET"
        logBotApiVerbose("proxyBotApi: invalid API_PROXY_TARGET", { message })
        return NextResponse.json(
            {
                ok: false,
                error: {
                    error: "Bot API misconfigured",
                    details: message,
                },
            },
            { status: 503 }
        )
    }
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
    // Path + query come from this Next route's URL; guild scoping and auth are enforced by route
    // params and {@link resolveAuthenticatedGuildAccess} / {@link requirePermissions} before proxying.
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

    const controller = new AbortController()
    const timeoutMs = readBotApiProxyTimeoutMs()
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const upstream = await fetch(targetUrl, { ...init, signal: controller.signal })
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
        const isAbort =
            e instanceof DOMException
                ? e.name === "AbortError"
                : e instanceof Error && e.name === "AbortError"
        const message = e instanceof Error ? e.message : "Fetch failed"
        logBotApiVerbose("proxyBotApi ✖ fetch threw", {
            method,
            targetUrl,
            ms: Date.now() - started,
            error: message,
            timeout: isAbort,
        })
        return NextResponse.json(
            {
                ok: false,
                error: {
                    error: isAbort ? "Bot API timeout" : "Bot API unreachable",
                    details: isAbort
                        ? "Upstream bot API request timed out."
                        : "Upstream bot API request failed.",
                },
            },
            { status: isAbort ? 504 : 502 }
        )
    } finally {
        clearTimeout(timeoutHandle)
    }
}
