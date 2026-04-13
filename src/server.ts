import "dotenv/config"
import fs from "fs"
import http from "http"
import path from "path"
import { WebSocketServer } from "ws"
import { createBotApiApp } from "./botApi/createBotApiApp.js"
import { isBotApiVerbose } from "./util/botApiVerboseEnv.js"
import BotClient from "./lib/BotClient.js"
import { disconnectDatabase } from "./lib/database.js"
import Logger from "./lib/Logger.js"
import { setBotClient } from "./lib/botClientRegistry.js"
import { resolvedBotApiPort } from "./lib/botApiPortEnv.js"

const logFilePath = path.join(import.meta.dirname, "..", "logs", "app.log")
const botApiPort = resolvedBotApiPort()
const SHUTDOWN_TIMEOUT_MS = 10_000

function withShutdownTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(
            () => reject(new Error(`Timed out while waiting for ${label} (${timeoutMs}ms)`)),
            timeoutMs
        )
        promise.then(resolve, reject).finally(() => clearTimeout(timeoutId))
    })
}

function ensureLogDir(): void {
    try {
        const logDirectory = path.dirname(logFilePath)
        if (!fs.existsSync(logDirectory)) {
            fs.mkdirSync(logDirectory, { recursive: true })
            console.log(`Log directory created at ${logDirectory}`)
        }
    } catch (error) {
        console.error("Failed to create log directory:", error)
    }
}

function pathnameOnly(url: string | undefined): string {
    try {
        return new URL(url || "/", "http://localhost").pathname
    } catch {
        return "/"
    }
}

async function startBot(logger: Logger): Promise<BotClient> {
    logger.debug("Initializing BotClient...")
    const client = new BotClient(logger)
    logger.debug("BotClient initialized.")

    logger.debug("Starting BotClient...")
    await client.start()
    logger.info("BotClient started successfully.")
    setBotClient(client)
    return client
}

async function run(): Promise<void> {
    ensureLogDir()

    const logger = new Logger(logFilePath)
    logger.info("Starting application...")
    if (logger.getDebugEnabled()) {
        logger.info("Debug logging is enabled via LOG_LEVEL environment variable.")
    } else {
        logger.info("Debug logging is disabled. Set LOG_LEVEL=debug to enable it.")
    }

    let client: BotClient | null = null
    let server: http.Server | null = null
    let stopHeartbeat: (() => void) | null = null
    let wss: WebSocketServer | null = null
    const shutdown = async (signal: string): Promise<void> => {
        logger.info(`Received ${signal}, shutting down...`)
        let shouldExitWithFailure = false
        try {
            stopHeartbeat?.()
            if (wss) {
                for (const ws of wss.clients) {
                    try {
                        ws.terminate()
                    } catch {
                        /* ignore */
                    }
                }
                const wssClose = new Promise<void>((resolve) => {
                    wss?.close(() => resolve())
                })
                await withShutdownTimeout(wssClose, SHUTDOWN_TIMEOUT_MS, "WebSocket server close")
                wss = null
                logger.info("WebSocket server stopped.")
            }
            if (server) {
                const closePromise = new Promise<void>((resolve) => {
                    server?.close(() => resolve())
                })
                await withShutdownTimeout(closePromise, SHUTDOWN_TIMEOUT_MS, "web server close")
                logger.info("Web server stopped.")
            }
            if (client) {
                try {
                    await withShutdownTimeout(
                        client.destroy(),
                        SHUTDOWN_TIMEOUT_MS,
                        "Discord client shutdown"
                    )
                } catch (destroyErr: unknown) {
                    shouldExitWithFailure = true
                    logger.error("Error while destroying Discord client:", destroyErr)
                }
                logger.info("Bot client stopped.")
            }
            try {
                await disconnectDatabase(logger)
            } catch (disconnectError: unknown) {
                shouldExitWithFailure = true
                logger.error("Error while disconnecting database:", disconnectError)
            }
        } catch (error: unknown) {
            shouldExitWithFailure = true
            logger.error("Shutdown timed out or failed:", error)
        } finally {
            process.exit(shouldExitWithFailure ? 1 : 0)
        }
    }

    process.once("SIGINT", () => void shutdown("SIGINT"))
    process.once("SIGTERM", () => void shutdown("SIGTERM"))

    try {
        client = await startBot(logger)

        const { connectionManager } = await import("./web/websocket/ConnectionManager.js")
        const { invalidatePermissionCache } = await import("./web/shared/permissions.js")
        const { playerBroadcaster } = await import("./web/websocket/PlayerBroadcaster.js")

        const botApiApp = createBotApiApp()
        logger.info(
            "Serving bot HTTP: /health, /api/guilds/* (Express), /ws (WebSocket). Next.js is not used here."
        )

        wss = new WebSocketServer({ noServer: true })
        connectionManager.startHeartbeat()
        stopHeartbeat = () => connectionManager.stopHeartbeat()

        server = http.createServer((req, res) => {
            const pathOnly = pathnameOnly(req.url)
            if (pathOnly === "/health" || pathOnly === "/health/") {
                if (isBotApiVerbose()) {
                    console.log("[bot-api:express] GET /health -> 200")
                }
                res.statusCode = 200
                res.setHeader("Content-Type", "text/plain; charset=utf-8")
                res.end("ok")
                return
            }
            if (pathOnly.startsWith("/api/guilds")) {
                botApiApp(req, res)
                return
            }
            res.statusCode = 404
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ ok: false, error: "Not found" }))
        })

        server.on("upgrade", (req, socket, head) => {
            const pathOnly = pathnameOnly(req.url)
            if (pathOnly !== "/ws" && pathOnly !== "/ws/") {
                socket.destroy()
                return
            }
            void (async () => {
                try {
                    const session = await connectionManager.authenticateUpgrade(req)
                    if (!session) {
                        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
                        socket.destroy()
                        return
                    }
                    wss.handleUpgrade(req, socket, head, (ws) => {
                        connectionManager.registerConnection(ws, session.userId)
                        wss.emit("connection", ws, req)
                    })
                } catch (error) {
                    logger.error("WebSocket upgrade authentication failed:", error)
                    socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n")
                    socket.destroy()
                }
            })()
        })

        client.on("voiceStateUpdate", (oldState, newState) => {
            const userId = newState.id
            const guildIds = new Set<string>()
            if (newState.guild?.id) {
                guildIds.add(newState.guild.id)
            }
            const oldGuildId = oldState.guild?.id
            if (oldGuildId && oldGuildId !== newState.guild?.id) {
                guildIds.add(oldGuildId)
            }
            for (const guildId of guildIds) {
                invalidatePermissionCache(guildId, userId)
                playerBroadcaster.broadcastGuildVoiceState(guildId)
            }
        })

        client.on("guildMemberUpdate", (_oldMember, newMember) => {
            invalidatePermissionCache(newMember.guild.id, newMember.id)
        })
        client.on("guildMemberRemove", (member) => {
            invalidatePermissionCache(member.guild.id, member.id)
        })
        client.on("roleUpdate", (_oldRole, newRole) => {
            invalidatePermissionCache(newRole.guild.id)
        })
        client.on("roleDelete", (role) => {
            invalidatePermissionCache(role.guild.id)
        })

        await new Promise<void>((resolve, reject) => {
            const httpServer = server
            if (!httpServer) {
                reject(new Error("HTTP server was not initialized"))
                return
            }
            const onListenError = (err: NodeJS.ErrnoException) => {
                httpServer.off("error", onListenError)
                reject(err)
            }
            httpServer.once("error", onListenError)
            httpServer.listen(botApiPort, () => {
                httpServer.off("error", onListenError)
                resolve()
            })
        })
        logger.info(`Bot API (HTTP + /ws) listening on http://localhost:${botApiPort}`)
    } catch (error: unknown) {
        const errno = error as NodeJS.ErrnoException | undefined
        if (errno && errno.code === "EADDRINUSE") {
            logger.error(
                `Bot API server could not bind to port ${botApiPort}: address already in use (EADDRINUSE).`,
                error
            )
        } else {
            logger.error("Fatal error during application startup:", error)
        }
        process.exit(1)
    }
}

void run()
