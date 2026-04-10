import type { IncomingMessage } from "http"
import type { WebSocket } from "ws"
import {
    WebPermission,
    hasRequiredPermissions,
    resolveUserPermissions,
} from "../shared/permissions.js"
import type { WSMessage } from "../types/web.js"
import { auth } from "../auth-node.js"
import { getBotClient } from "../lib/botClient.js"
import { resolveDiscordUserSnowflake } from "../lib/discord-user-id.js"
import { parseWsConnectToken } from "../lib/ws-connect-token.js"

interface SocketMeta {
    userId: string
    guildSubscriptions: Set<string>
    isAlive: boolean
}

export class ConnectionManager {
    private readonly guildConnections = new Map<string, Set<WebSocket>>()
    private readonly socketMeta = new Map<WebSocket, SocketMeta>()
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
            }
        } catch {
            // ignore malformed upgrade URL
        }

        const session = (await auth.api.getSession({
            headers,
        })) as { user?: { id?: string } } | null

        if (!session?.user?.id) {
            return null
        }
        const betterAuthUserId = session.user.id
        const discordUserId = await resolveDiscordUserSnowflake(betterAuthUserId, headers)
        return discordUserId ? { userId: discordUserId } : null
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
            void this.handleMessage(socket, buffer.toString())
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
            if (socket.readyState === socket.OPEN) {
                socket.send(payload)
            }
        }
    }

    broadcastWithResolver(guildId: string, factory: (userId: string) => WSMessage): void {
        for (const socket of this.getGuildConnections(guildId)) {
            const meta = this.socketMeta.get(socket)
            if (!meta || socket.readyState !== socket.OPEN) continue
            socket.send(JSON.stringify(factory(meta.userId)))
        }
    }

    private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
        const meta = this.socketMeta.get(socket)
        if (!meta) return

        let parsed: Partial<WSMessage>
        try {
            parsed = JSON.parse(raw) as Partial<WSMessage>
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

            const resolution = await resolveUserPermissions(getBotClient(), guildId, meta.userId)
            if (!hasRequiredPermissions(resolution.permissions, [WebPermission.VIEW_PLAYER])) {
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

            this.subscribe(socket, guildId)
            socket.send(
                JSON.stringify({
                    type: "subscribed",
                    guildId,
                })
            )
        }
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
    }
}

export const connectionManager = new ConnectionManager()
