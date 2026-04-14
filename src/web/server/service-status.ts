import { sanitizeErrorText } from "@/lib/sanitize-log-text"
import { getWebPrismaClient } from "@/lib/prisma"
import type { StatusPayload } from "@/types/web"
import { getBotApiOrigin } from "@/server/bot-api-origin"
import { isBotApiVerbose, logBotApiVerbose } from "@/server/bot-api-verbose"
import { tryGetBotClient } from "@/lib/botClient"

/** Safe structured error info for logs (no raw credentials). */
function sanitizeError(e: unknown): {
    errorType: string
    redactedMessage: string
    redactedStack?: string
} {
    const errorType = e instanceof Error ? e.name : typeof e
    const rawMessage = e instanceof Error ? e.message : String(e)
    const base = {
        errorType,
        redactedMessage: sanitizeErrorText(rawMessage, 400),
    }
    if (e instanceof Error && e.stack) {
        return { ...base, redactedStack: sanitizeErrorText(e.stack, 4000) }
    }
    return base
}

/** Shared probe logic for the status page and `GET /api/status`. */
export async function getServiceStatusPayload(): Promise<StatusPayload> {
    const checkedAt = new Date().toISOString()
    const database: StatusPayload["database"] = { ok: false }
    const botApi: StatusPayload["botApi"] = { ok: false }

    const DB_PROBE_TIMEOUT_MS = 4000
    let dbProbeTimer: ReturnType<typeof setTimeout> | undefined
    try {
        const timeoutPromise = new Promise<never>((_, reject) => {
            dbProbeTimer = setTimeout(
                () => reject(new Error("Database probe timed out")),
                DB_PROBE_TIMEOUT_MS
            )
        })
        await Promise.race([getWebPrismaClient().$queryRaw`SELECT 1`, timeoutPromise])
        database.ok = true
    } catch (e) {
        database.message = "Database unreachable"
        console.error("[service-status] Database probe failed", sanitizeError(e))
    } finally {
        if (dbProbeTimer !== undefined) {
            clearTimeout(dbProbeTimer)
        }
    }

    if (tryGetBotClient()) {
        botApi.ok = true
        logBotApiVerbose(
            "getServiceStatusPayload: in-process bot client present; skipping /health probe"
        )
    } else {
        let origin: string | null = null
        try {
            origin = getBotApiOrigin()
        } catch (e) {
            botApi.message = "API_PROXY_TARGET is invalid; cannot probe bot /health."
            console.error("[service-status] API_PROXY_TARGET parse failed", sanitizeError(e))
        }
        if (!origin && !botApi.message) {
            botApi.message =
                "API_PROXY_TARGET is not set; cannot probe bot /health in this environment."
            logBotApiVerbose("getServiceStatusPayload: bot probe skipped (no origin)")
        } else if (origin) {
            let healthUrl = ""
            let healthTarget: { host: string; pathname: string } | undefined
            try {
                const parsed = new URL("/health", origin)
                healthUrl = parsed.toString()
                healthTarget = { host: parsed.host, pathname: parsed.pathname }
            } catch (e) {
                botApi.message = "API_PROXY_TARGET is not a valid origin; cannot probe bot /health."
                console.error(
                    "[service-status] Invalid bot API origin for /health URL",
                    sanitizeError(e)
                )
                logBotApiVerbose("getServiceStatusPayload: bot probe skipped (invalid origin)")
            }
            if (healthUrl) {
                const started = Date.now()
                if (isBotApiVerbose()) {
                    logBotApiVerbose("getServiceStatusPayload: probing bot /health", {
                        healthTarget,
                    })
                }
                let abortTimer: ReturnType<typeof setTimeout> | undefined
                try {
                    const controller = new AbortController()
                    abortTimer = setTimeout(() => controller.abort(), 4000)
                    const res = await fetch(healthUrl, {
                        signal: controller.signal,
                    })
                    if (res.ok) {
                        botApi.ok = true
                        logBotApiVerbose("getServiceStatusPayload: bot /health ok", {
                            ms: Date.now() - started,
                            status: res.status,
                        })
                    } else {
                        botApi.message = `Bot /health returned HTTP ${res.status}`
                        logBotApiVerbose("getServiceStatusPayload: bot /health non-ok", {
                            ms: Date.now() - started,
                            status: res.status,
                        })
                    }
                } catch (e) {
                    if (e instanceof Error && e.name === "AbortError") {
                        botApi.message = "Timed out connecting to bot /health"
                    } else {
                        botApi.message = "Bot /health request failed"
                        console.error(
                            "[service-status] Bot /health request failed",
                            sanitizeError(e)
                        )
                    }
                    logBotApiVerbose("getServiceStatusPayload: bot /health failed", {
                        ms: Date.now() - started,
                        message: botApi.message,
                    })
                } finally {
                    if (abortTimer !== undefined) {
                        clearTimeout(abortTimer)
                    }
                }
            }
        }
    }

    const derivedOk = Boolean(database.ok && botApi.ok)
    return { ok: derivedOk, checkedAt, database, botApi }
}
