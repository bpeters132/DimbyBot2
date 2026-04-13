import type { IncomingMessage } from "http"
import WebSocket from "ws"
import {
    WebPermission,
    hasRequiredPermissions,
    resolveUserPermissions,
} from "../shared/permissions.js"
import type { WSMessage } from "../types/web.js"
import { auth } from "../auth-node.js"
import { tryGetBotClient } from "../lib/botClient.js"
import { resolveDiscordUserSnowflake } from "../lib/discord-user-id.js"
import { parseWsConnectToken } from "../lib/ws-connect-token.js"
import { webPlayerTrace, webPlayerWarn } from "../lib/web-player-debug-log.js"

interface SocketMeta {
    userId: string
    guildSubscriptions: Set<string>
    isAlive: boolean
}

export class ConnectionManager {
    private readonly guildConnections = new Map<string, Set<WebSocket>>()
    private readonly socketMeta = new Map<WebSocket, SocketMeta>()
    /** Last subscribe attempt per socket (same guild) for debouncing permission resolution. */
    private readonly subscribeLastAttempt = new Map<
        WebSocket,
        { guildId: string; at: number; success: boolean }
    >()
    private static readonly SUBSCRIBE_DEBOUNCE_MS = 4000
    private readonly heartbeatIntervalMs: number
    private heartbeatTimer: NodeJS.Timeout | null = null

    constructor(heartbeatIntervalMs = 30000) {
        this.heartbeatIntervalMs = heartbeatIntervalMs
    }

    startHeartbeat(): void {
        if (this.heartbeatTimer) return
        this.heartbeatTimer = setInterval(() => {
            for (const [socket, meta] of this.socketMeta.entries()) {
                if (!meta.isAlive) {
                    socket.terminate()
                    this.cleanupSocket(socket)
                    continue
                }
                meta.isAlive = false
                socket.ping()
            }
        }, this.heartbeatIntervalMs)
        this.heartbeatTimer.unref()
    }

    stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer)
            this.heartbeatTimer = null
        }
    }

    async authenticateUpgrade(request: IncomingMessage): Promise<{ userId: string } | null> {
        const secret = process.env.BETTER_AUTH_SECRET
        const rawUrl = request.url || "/"

        const headers = new Headers()
        for (const [key, value] of Object.entries(request.headers)) {
            if (Array.isArray(value)) {
                headers.set(key, value.join(","))
            } else if (value !== undefined) {
                headers.set(key, value)
            }
        }

        try {
            const parsed = new URL(rawUrl, "http://127.0.0.1")
            const ticket = parsed.searchParams.get("ticket")
            if (ticket && secret) {
                try {
                    const betterAuthUserId = parseWsConnectToken(ticket, secret)
                    if (betterAuthUserId) {
                        const discordUserId = await resolveDiscordUserSnowflake(
                            betterAuthUserId,
                            headers
                        )
                        if (discordUserId) {
                            return { userId: discordUserId }
                        }
                    }
                } catch (error: unknown) {
                    webPlayerWarn(
                        "WS ticket auth failed",
                        error instanceof Error
                            ? { name: error.name, message: error.message }
                            : { message: "auth_error" }
                    )
                }
            }
        } catch {
            // ignore malformed upgrade URL
        }

        let session: { user?: { id?: string } } | null
        try {
            session = (await auth.api.getSession({
                headers,
            })) as { user?: { id?: string } } | null
        } catch (error: unknown) {
            webPlayerWarn(
                "WS fallback session auth failed",
                error instanceof Error
                    ? { name: error.name, message: error.message }
                    : { message: "auth_error" }
            )
            return null
        }
        if (!session?.user?.id) {
            return null
        }
        const betterAuthUserId = session.user.id
        try {
            const discordUserId = await resolveDiscordUserSnowflake(betterAuthUserId, headers)
            return discordUserId ? { userId: discordUserId } : null
        } catch (error: unknown) {
            webPlayerWarn(
                "WS fallback discord snowflake resolve failed",
                error instanceof Error
                    ? { name: error.name, message: error.message }
                    : { message: "auth_error" }
            )
            return null
        }
    }

    registerConnection(socket: WebSocket, userId: string): void {
        this.socketMeta.set(socket, {
            userId,
            guildSubscriptions: new Set<string>(),
            isAlive: true,
        })

        socket.on("pong", () => {
            const meta = this.socketMeta.get(socket)
            if (meta) {
                meta.isAlive = true
            }
        })

        socket.on("message", (buffer) => {
            this.handleMessage(socket, buffer.toString()).catch((err: unknown) => {
                const message = err instanceof Error ? err.message : String(err)
                webPlayerWarn("WS handleMessage unhandled error", { message })
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(
                        JSON.stringify({
                            type: "error",
                            message: "An internal error occurred processing your message.",
                        })
                    )
                }
            })
        })

        socket.on("close", () => this.cleanupSocket(socket))
        socket.on("error", () => this.cleanupSocket(socket))
    }

    getGuildConnections(guildId: string): Set<WebSocket> {
        return this.guildConnections.get(guildId) ?? new Set<WebSocket>()
    }

    broadcast(guildId: string, message: WSMessage): void {
        const payload = JSON.stringify(message)
        for (const socket of this.getGuildConnections(guildId)) {
            void this.sendToSocketIfAuthorized(socket, guildId, payload).catch((err: unknown) => {
                const message = err instanceof Error ? err.message : String(err)
                webPlayerWarn("broadcast send failed", { guildId, message })
            })
        }
    }

    async broadcastWithResolver(
        guildId: string,
        factory: (userId: string) => WSMessage | null
    ): Promise<void> {
        for (const socket of this.getGuildConnections(guildId)) {
            const meta = this.socketMeta.get(socket)
            if (!meta || socket.readyState !== WebSocket.OPEN) continue
            try {
                const allowed = await this.canViewPlayer(socket, guildId, meta.userId)
                if (!allowed) continue
                const payload = factory(meta.userId)
                if (!payload) continue
                socket.send(JSON.stringify(payload))
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                webPlayerWarn("broadcastWithResolver per-socket error", { guildId, message })
            }
        }
    }

    private async sendToSocketIfAuthorized(
        socket: WebSocket,
        guildId: string,
        payload: string
    ): Promise<void> {
        const meta = this.socketMeta.get(socket)
        if (!meta || socket.readyState !== WebSocket.OPEN) return
        const allowed = await this.canViewPlayer(socket, guildId, meta.userId)
        if (!allowed) return
        socket.send(payload)
    }

    private async canViewPlayer(
        socket: WebSocket,
        guildId: string,
        userId: string
    ): Promise<boolean> {
        const botClient = tryGetBotClient()
        if (!botClient) {
            this.forceUnsubscribeSocket(socket, guildId, "BOT_UNAVAILABLE")
            return false
        }
        try {
            const resolution = await resolveUserPermissions(botClient, guildId, userId)
            const allowed = hasRequiredPermissions(resolution.permissions, [
                WebPermission.VIEW_PLAYER,
            ])
            if (!allowed) {
                this.forceUnsubscribeSocket(socket, guildId, "SUBSCRIBE_FORBIDDEN")
                return false
            }
            return true
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            webPlayerWarn("WS permission resolution failed (canViewPlayer)", {
                guildId,
                userId,
                message,
            })
            this.forceUnsubscribeSocket(socket, guildId, "PERMISSION_RESOLUTION_ERROR")
            return false
        }
    }

    private forceUnsubscribeSocket(socket: WebSocket, guildId: string, code: string): void {
        this.unsubscribe(socket, guildId)
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(
                JSON.stringify({
                    type: "error",
                    code,
                    message:
                        "Live updates were removed because your access to this guild player changed.",
                })
            )
            socket.send(JSON.stringify({ type: "unsubscribed", guildId }))
        }
    }

    private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
        const meta = this.socketMeta.get(socket)
        if (!meta) return

        let parsed: Record<string, unknown>
        try {
            parsed = JSON.parse(raw) as Record<string, unknown>
        } catch {
            socket.send(JSON.stringify({ type: "error", message: "Invalid message JSON." }))
            return
        }
        if (parsed.type === "ping") {
            socket.send(JSON.stringify({ type: "pong" }))
            return
        }

        if (parsed.type === "subscribe") {
            const guildId = parsed.guildId
            if (!guildId || typeof guildId !== "string") {
                socket.send(
                    JSON.stringify({ type: "error", message: "Invalid guildId for subscribe." })
                )
                return
            }

            const botClient = tryGetBotClient()
            if (!botClient) {
                this.subscribeLastAttempt.set(socket, { guildId, at: Date.now(), success: false })
                socket.send(
                    JSON.stringify({
                        type: "error",
                        code: "BOT_UNAVAILABLE",
                        message:
                            "Live updates require the bot process to be running with this dashboard.",
                    })
                )
                return
            }

            const now = Date.now()
            const last = this.subscribeLastAttempt.get(socket)
            if (
                last &&
                last.guildId === guildId &&
                now - last.at < ConnectionManager.SUBSCRIBE_DEBOUNCE_MS
            ) {
                this.subscribeLastAttempt.set(socket, { guildId, at: now, success: last.success })
                webPlayerTrace("WS subscribe debounced (same guild)", {
                    guildId,
                    viewerIdPrefix: meta.userId.slice(0, 8),
                })
                if (last.success) {
                    socket.send(JSON.stringify({ type: "subscribed", guildId }))
                } else {
                    socket.send(
                        JSON.stringify({
                            type: "error",
                            code: "SUBSCRIBE_DEBOUNCED_FAILURE",
                            message: "Recent subscription attempt failed. Please retry shortly.",
                        })
                    )
                }
                return
            }

            let resolution: Awaited<ReturnType<typeof resolveUserPermissions>>
            try {
                resolution = await resolveUserPermissions(botClient, guildId, meta.userId)
            } catch (error: unknown) {
                this.subscribeLastAttempt.set(socket, { guildId, at: Date.now(), success: false })
                const message = error instanceof Error ? error.message : String(error)
                webPlayerWarn("WS subscribe permission resolution failed", {
                    guildId,
                    viewerIdPrefix: meta.userId.slice(0, 8),
                    message,
                })
                socket.send(
                    JSON.stringify({
                        type: "error",
                        code: "PERMISSION_RESOLUTION_ERROR",
                        message: "Could not resolve permissions for this subscription request.",
                    })
                )
                return
            }
            if (!hasRequiredPermissions(resolution.permissions, [WebPermission.VIEW_PLAYER])) {
                this.subscribeLastAttempt.set(socket, { guildId, at: Date.now(), success: false })
                webPlayerWarn("WS subscribe denied (VIEW_PLAYER missing)", {
                    guildId,
                    viewerIdPrefix: meta.userId.slice(0, 8),
                    permissions: resolution.permissions,
                    inVoiceWithBot: resolution.inVoiceWithBot,
                })
                socket.send(
                    JSON.stringify({
                        type: "error",
                        code: "SUBSCRIBE_FORBIDDEN",
                        message:
                            "Live updates are blocked: the bot could not verify your access to this server’s player (sign in with Discord, same account as in the server). This is not about voice channels or whether music is playing.",
                    })
                )
                return
            }

            this.clearSubscriptions(socket)
            this.subscribe(socket, guildId)
            this.subscribeLastAttempt.set(socket, { guildId, at: Date.now(), success: true })
            webPlayerTrace("WS subscribed", {
                guildId,
                viewerIdPrefix: meta.userId.slice(0, 8),
            })
            socket.send(
                JSON.stringify({
                    type: "subscribed",
                    guildId,
                })
            )
            return
        }

        if (parsed.type === "unsubscribe") {
            const guildId = parsed.guildId
            if (!guildId || typeof guildId !== "string") {
                socket.send(
                    JSON.stringify({ type: "error", message: "Invalid guildId for unsubscribe." })
                )
                return
            }
            this.unsubscribe(socket, guildId)
            socket.send(JSON.stringify({ type: "unsubscribed", guildId }))
        }
    }

    /** Drops all guild subscriptions for a socket (one active guild per subscribe). */
    private clearSubscriptions(socket: WebSocket): void {
        const meta = this.socketMeta.get(socket)
        if (!meta) return
        for (const guildId of [...meta.guildSubscriptions]) {
            this.unsubscribe(socket, guildId)
        }
    }

    private unsubscribe(socket: WebSocket, guildId: string): void {
        const meta = this.socketMeta.get(socket)
        if (!meta) return
        const sockets = this.guildConnections.get(guildId)
        if (sockets) {
            sockets.delete(socket)
            if (sockets.size === 0) {
                this.guildConnections.delete(guildId)
            }
        }
        meta.guildSubscriptions.delete(guildId)
    }

    private subscribe(socket: WebSocket, guildId: string): void {
        const meta = this.socketMeta.get(socket)
        if (!meta) return

        const sockets = this.guildConnections.get(guildId) ?? new Set<WebSocket>()
        sockets.add(socket)
        this.guildConnections.set(guildId, sockets)
        meta.guildSubscriptions.add(guildId)
    }

    private cleanupSocket(socket: WebSocket): void {
        const meta = this.socketMeta.get(socket)
        if (!meta) return

        for (const guildId of meta.guildSubscriptions) {
            const sockets = this.guildConnections.get(guildId)
            if (!sockets) continue
            sockets.delete(socket)
            if (sockets.size === 0) {
                this.guildConnections.delete(guildId)
            }
        }

        this.socketMeta.delete(socket)
        this.subscribeLastAttempt.delete(socket)
    }
}

export const connectionManager = new ConnectionManager()
