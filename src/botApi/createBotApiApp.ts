import express from "express"
import { isBotApiVerbose } from "../util/botApiVerboseEnv.js"
import { incomingMessageToHeaders } from "./httpUtil.js"
import { guildListGET } from "./handlers/guildList.js"
import { voiceContextGET } from "./handlers/voiceContext.js"
import { playerGET, playerPOST } from "./handlers/player.js"
import { playerPlayPOST } from "./handlers/playerPlay.js"
import { queueDELETE, queueGET, queuePOST } from "./handlers/queue.js"
import { queueIndexDELETE, queueIndexPATCH } from "./handlers/queueIndex.js"
import { dashboardPermissionsGET } from "./handlers/dashboardPermissions.js"
import { adminMetricsGET } from "./handlers/admin/metrics.js"
import { adminErrorsDELETE, adminErrorsGET } from "./handlers/admin/errors.js"
import { adminDbCleanupPOST, adminDbStatsGET } from "./handlers/admin/database.js"
import { BotClientNotInitializedError } from "../lib/botClientRegistry.js"
import {
    playlistTrackMovePATCH,
    playlistTracksDELETE,
    playlistTracksFromQueryPOST,
    playlistTracksPOST,
    playlistsDELETE,
    playlistsDetailGET,
    playlistsGET,
    playlistsPOST,
} from "./handlers/playlists.js"
import { playerPlaylistPlayPOST } from "./handlers/playlistPlay.js"

/** Redacts credentials and long base64-like blobs from bot API error strings before JSON responses. */
function redactBotApiErrorText(text: string): string {
    return text
        .replace(/(token|secret|password|cookie)\s*[=:]\s*[^\s]+/gi, "$1=[redacted]")
        .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
        .replace(/([a-z][a-z0-9+.-]*:\/\/)[^@/?#\s]+@/gi, "$1[redacted]@")
        .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
}

function sanitizeBotApiError(err: unknown): {
    name: string
    message: string
    safeStack?: string
} {
    if (err instanceof Error) {
        const redactedMessage = redactBotApiErrorText(err.message)
        const firstLine = err.stack?.split("\n")[0]
        const safeStack = firstLine ? redactBotApiErrorText(firstLine) : undefined
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

    app.get("/api/guilds/voice-context", async (req, res, next) => {
        try {
            const r = await voiceContextGET(incomingMessageToHeaders(req))
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.get("/api/guilds/:guildId/dashboard-permissions", async (req, res, next) => {
        try {
            const r = await dashboardPermissionsGET(
                incomingMessageToHeaders(req),
                req.params.guildId
            )
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

    app.post("/api/guilds/:guildId/player/play-playlist", async (req, res, next) => {
        try {
            const r = await playerPlaylistPlayPOST(
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

    app.get("/api/playlists", async (req, res, next) => {
        try {
            const r = await playlistsGET(incomingMessageToHeaders(req))
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.post("/api/playlists", async (req, res, next) => {
        try {
            const r = await playlistsPOST(incomingMessageToHeaders(req), req.body)
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.get("/api/playlists/:playlistId", async (req, res, next) => {
        try {
            const r = await playlistsDetailGET(
                incomingMessageToHeaders(req),
                req.params.playlistId
            )
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.delete("/api/playlists/:playlistId", async (req, res, next) => {
        try {
            const r = await playlistsDELETE(
                incomingMessageToHeaders(req),
                req.params.playlistId
            )
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.post("/api/playlists/:playlistId/tracks", async (req, res, next) => {
        try {
            const r = await playlistTracksPOST(
                incomingMessageToHeaders(req),
                req.params.playlistId,
                req.body
            )
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.post("/api/playlists/:playlistId/tracks/from-query", async (req, res, next) => {
        try {
            const r = await playlistTracksFromQueryPOST(
                incomingMessageToHeaders(req),
                req.params.playlistId,
                req.body
            )
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.patch("/api/playlists/:playlistId/tracks/:position", async (req, res, next) => {
        try {
            const r = await playlistTrackMovePATCH(
                incomingMessageToHeaders(req),
                req.params.playlistId,
                req.params.position,
                req.body
            )
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.delete("/api/playlists/:playlistId/tracks/:position", async (req, res, next) => {
        try {
            const r = await playlistTracksDELETE(
                incomingMessageToHeaders(req),
                req.params.playlistId,
                req.params.position
            )
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.get("/api/admin/metrics", async (req, res, next) => {
        try {
            const r = await adminMetricsGET(incomingMessageToHeaders(req))
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.get("/api/admin/errors", async (req, res, next) => {
        try {
            const url = new URL(req.originalUrl || req.url || "/", "http://localhost")
            const r = await adminErrorsGET(incomingMessageToHeaders(req), url.searchParams)
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.delete("/api/admin/errors", async (req, res, next) => {
        try {
            const r = await adminErrorsDELETE(incomingMessageToHeaders(req))
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.get("/api/admin/database/stats", async (req, res, next) => {
        try {
            const r = await adminDbStatsGET(incomingMessageToHeaders(req))
            res.status(r.status).json(r.body)
        } catch (error) {
            next(error)
        }
    })

    app.post("/api/admin/database/cleanup", async (req, res, next) => {
        try {
            const url = new URL(req.originalUrl || req.url || "/", "http://localhost")
            const r = await adminDbCleanupPOST(
                incomingMessageToHeaders(req),
                req.body,
                url.searchParams
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
                        details: sanitizeBotApiError(err).message,
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
                const details = sanitizeBotApiError(err).message || "Bad request"
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
