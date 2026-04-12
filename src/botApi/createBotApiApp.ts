import express from "express"
import { isBotApiVerbose } from "../util/botApiVerboseEnv.js"
import { incomingMessageToHeaders } from "./httpUtil.js"
import { guildListGET } from "./handlers/guildList.js"
import { playerGET, playerPOST } from "./handlers/player.js"
import { playerPlayPOST } from "./handlers/playerPlay.js"
import { queueDELETE, queueGET, queuePOST } from "./handlers/queue.js"
import { queueIndexDELETE, queueIndexPATCH } from "./handlers/queueIndex.js"
import { BotClientNotInitializedError } from "../web/lib/botClient.js"

function sanitizeBotApiError(err: unknown): {
    name: string
    message: string
    safeStack?: string
} {
    if (err instanceof Error) {
        const redactedMessage = err.message
            .replace(/(token|secret|password|cookie)\s*[=:]\s*[^\s]+/gi, "$1=[redacted]")
            .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
        const safeStack = err.stack?.split("\n")[0]
        return { name: err.name, message: redactedMessage, safeStack }
    }
    if (typeof err === "string") {
        return { name: "Error", message: "[redacted]" }
    }
    return { name: "UnknownError", message: "Unexpected error shape" }
}

/**
 * Express app for bot-backed REST routes (`/api/guilds/...`) shared with Next route handlers.
 */
export function createBotApiApp(): express.Express {
    const app = express()

    app.use((req, res, next) => {
        if (!isBotApiVerbose()) {
            next()
            return
        }
        const started = Date.now()
        const pathOnly = (req.originalUrl ?? req.url ?? "").split("?")[0]
        res.on("finish", () => {
            console.log(
                "[bot-api:express]",
                req.method,
                pathOnly,
                res.statusCode,
                `${Date.now() - started}ms`
            )
        })
        next()
    })

    app.use(express.json({ limit: "1mb" }))

    app.get("/api/guilds", async (req, res, next) => {
        try {
            const r = await guildListGET(incomingMessageToHeaders(req))
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.get("/api/guilds/:guildId/player", async (req, res, next) => {
        try {
            const r = await playerGET(incomingMessageToHeaders(req), req.params.guildId)
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.post("/api/guilds/:guildId/player", async (req, res, next) => {
        try {
            const r = await playerPOST(incomingMessageToHeaders(req), req.params.guildId, req.body)
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.post("/api/guilds/:guildId/player/play", async (req, res, next) => {
        try {
            const r = await playerPlayPOST(
                incomingMessageToHeaders(req),
                req.params.guildId,
                req.body
            )
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.get("/api/guilds/:guildId/queue", async (req, res, next) => {
        try {
            const url = new URL(req.originalUrl || req.url || "/", "http://localhost")
            const r = await queueGET(
                incomingMessageToHeaders(req),
                req.params.guildId,
                url.searchParams
            )
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.post("/api/guilds/:guildId/queue", async (req, res, next) => {
        try {
            const r = await queuePOST(incomingMessageToHeaders(req), req.params.guildId, req.body)
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.delete("/api/guilds/:guildId/queue", async (req, res, next) => {
        try {
            const r = await queueDELETE(incomingMessageToHeaders(req), req.params.guildId)
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.delete("/api/guilds/:guildId/queue/:index", async (req, res, next) => {
        try {
            const r = await queueIndexDELETE(
                incomingMessageToHeaders(req),
                req.params.guildId,
                req.params.index
            )
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.patch("/api/guilds/:guildId/queue/:index", async (req, res, next) => {
        try {
            const r = await queueIndexPATCH(
                incomingMessageToHeaders(req),
                req.params.guildId,
                req.params.index,
                req.body
            )
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.use(
        (
            err: unknown,
            req: express.Request,
            res: express.Response,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express error middleware requires a 4-arg signature
            _next: express.NextFunction
        ) => {
            const safeError = sanitizeBotApiError(err)
            const pathOnly = (req.originalUrl ?? req.url ?? "").split("?")[0]
            const parseError =
                err instanceof SyntaxError &&
                typeof err === "object" &&
                err !== null &&
                "status" in err &&
                "type" in err &&
                (err as { status?: unknown; type?: unknown }).status === 400 &&
                (err as { type?: unknown }).type === "entity.parse.failed"
            const errObj = err as { status?: unknown; statusCode?: unknown }
            const fromStatus = typeof errObj.status === "number" ? errObj.status : undefined
            const fromStatusCode =
                typeof errObj.statusCode === "number" ? errObj.statusCode : undefined
            const preferredStatus =
                fromStatus !== undefined
                    ? fromStatus
                    : fromStatusCode !== undefined
                      ? fromStatusCode
                      : undefined
            const numericClientError =
                preferredStatus !== undefined &&
                Number.isFinite(preferredStatus) &&
                preferredStatus >= 400 &&
                preferredStatus < 500
                    ? Math.floor(preferredStatus)
                    : undefined
            let responseStatus = 500
            if (parseError) {
                responseStatus = 400
            } else if (err instanceof BotClientNotInitializedError) {
                responseStatus = 503
            } else if (numericClientError !== undefined) {
                responseStatus = numericClientError
            }
            console.error("[botApi] request failed", {
                method: req.method,
                path: pathOnly,
                status: responseStatus,
                error: safeError,
            })
            if (parseError) {
                res.status(400).json({
                    ok: false,
                    error: {
                        error: "Malformed JSON",
                        details: (err as Error).message,
                    },
                })
                return
            }
            if (err instanceof BotClientNotInitializedError) {
                res.status(503).json({
                    ok: false,
                    error: {
                        error: "Bot is not ready",
                        details: err.message,
                    },
                })
                return
            }
            if (numericClientError !== undefined) {
                const details = err instanceof Error ? err.message : "Bad request"
                res.status(numericClientError).json({
                    ok: false,
                    error: { error: "Request error", details },
                })
                return
            }
            res.status(500).json({ ok: false, error: { error: "Internal server error" } })
        }
    )

    return app
}
