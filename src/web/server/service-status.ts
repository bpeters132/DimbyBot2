import { getWebPrismaClient } from "@/lib/prisma"
import type { StatusPayload } from "@/types/web"
import { getBotApiOrigin } from "@/server/bot-api-origin"
import { isBotApiVerbose, logBotApiVerbose } from "@/server/bot-api-verbose"

/** Shared probe logic for the status page and `GET /api/status`. */
export async function getServiceStatusPayload(): Promise<StatusPayload> {
    const checkedAt = new Date().toISOString()
    const database: StatusPayload["database"] = { ok: false }
    const botApi: StatusPayload["botApi"] = { ok: false }

    try {
        await getWebPrismaClient().$queryRaw`SELECT 1`
        database.ok = true
    } catch (e) {
        database.message = e instanceof Error ? e.message : "Database check failed"
    }

    const origin = getBotApiOrigin()
    if (!origin) {
        botApi.message =
            "API_PROXY_TARGET is not set; cannot probe bot /health in this environment."
        logBotApiVerbose("getServiceStatusPayload: bot probe skipped (no origin)")
    } else {
        const healthUrl = new URL("/health", origin).toString()
        const started = Date.now()
        if (isBotApiVerbose()) {
            logBotApiVerbose("getServiceStatusPayload: probing bot /health", { healthUrl })
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
            botApi.message =
                e instanceof Error
                    ? e.name === "AbortError"
                        ? "Timed out connecting to bot /health"
                        : e.message
                    : "Bot /health request failed"
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

    return { ok: true, checkedAt, database, botApi }
}
