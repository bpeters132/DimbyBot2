import express from "express"
import { incomingMessageToHeaders } from "./httpUtil.js"
import { guildListGET } from "./handlers/guildList.js"
import { playerGET, playerPOST } from "./handlers/player.js"
import { playerPlayPOST } from "./handlers/playerPlay.js"
import { queueDELETE, queueGET, queuePOST } from "./handlers/queue.js"
import { queueIndexDELETE, queueIndexPATCH } from "./handlers/queueIndex.js"
import { BotClientNotInitializedError } from "../web/lib/botClient.js"

/** Same env as Next `bot-api-verbose.ts`: log each `/api/guilds/*` request when enabled. */
export function isBotApiRequestVerbose(): boolean {
    const v = (process.env.BOT_API_VERBOSE ?? process.env.WEB_BOT_API_VERBOSE ?? "").trim()
    return /^(1|true|yes|on)$/i.test(v)
}

/**
 * Express app for bot-backed REST routes (`/api/guilds/...`) shared with Next route handlers.
 */
export function createBotApiApp(): express.Express {
    const app = express()

    app.use((req, res, next) => {
        if (!isBotApiRequestVerbose()) {
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
            _req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ) => {
            void next
            console.error("[botApi]", err)
            const parseError =
                err instanceof SyntaxError &&
                typeof err === "object" &&
                err !== null &&
                "status" in err &&
                "type" in err &&
                (err as { status?: unknown; type?: unknown }).status === 400 &&
                (err as { type?: unknown }).type === "entity.parse.failed"
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
            res.status(500).json({ ok: false, error: { error: "Internal server error" } })
        }
    )

    return app
}
