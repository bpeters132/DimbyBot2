"use client"

import { useEffect, useRef, useState } from "react"
import type { PlayerStateResponse, QueueTrackSummary, WSMessage } from "@/types/web"
import { sanitizeHttpUrl } from "@/lib/url-utils"

const MAX_RECONNECT_ATTEMPTS = 12

function sanitizePlayerState(state: PlayerStateResponse): PlayerStateResponse {
    if (!state.currentTrack) return state
    const safeUri = sanitizeHttpUrl(state.currentTrack.uri) ?? "#"
    const safeThumbnailUrl = sanitizeHttpUrl(state.currentTrack.thumbnailUrl)
    return {
        ...state,
        currentTrack: {
            ...state.currentTrack,
            uri: safeUri,
            thumbnailUrl: safeThumbnailUrl ?? null,
        },
    }
}

function sanitizeQueueTrackSummaries(queue: QueueTrackSummary[]): QueueTrackSummary[] {
    return queue.map((track) => ({
        ...track,
        uri: sanitizeHttpUrl(track.uri) ?? "#",
        thumbnailUrl: sanitizeHttpUrl(track.thumbnailUrl) ?? null,
    }))
}

interface UsePlayerSocketResult {
    isConnected: boolean
    playerState: PlayerStateResponse | null
    queue: QueueTrackSummary[] | undefined
    /** Set when the server rejects subscribe or sends an error frame (permission/membership), not voice/player state. */
    liveUpdatesError: string | null
}

export function usePlayerSocket(guildId: string, userId?: string): UsePlayerSocketResult {
    const [isConnected, setIsConnected] = useState(false)
    const [playerState, setPlayerState] = useState<PlayerStateResponse | null>(null)
    const [queue, setQueue] = useState<QueueTrackSummary[] | undefined>(undefined)
    const [liveUpdatesError, setLiveUpdatesError] = useState<string | null>(null)
    const reconnectAttemptsRef = useRef(0)
    const socketRef = useRef<WebSocket | null>(null)
    const warnedMissingUserIdRef = useRef(false)

    useEffect(() => {
        let cancelled = false
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null
        setIsConnected(false)
        setPlayerState(null)
        setQueue(undefined)
        setLiveUpdatesError(null)

        const connect = async () => {
            if (cancelled) return

            if (
                process.env.NODE_ENV === "development" &&
                !userId?.trim() &&
                !warnedMissingUserIdRef.current
            ) {
                warnedMissingUserIdRef.current = true
                console.warn(
                    "[web-player] usePlayerSocket: missing `discordUserId` — voiceStateChange events will not apply to your client state; join/leave voice may look wrong until this is fixed."
                )
            }

            let ticket: string | null = null
            try {
                const ticketRes = await fetch("/api/ws-ticket", { credentials: "include" })
                if (ticketRes.ok) {
                    const data = (await ticketRes.json()) as { token?: string }
                    ticket = typeof data.token === "string" ? data.token : null
                }
            } catch {
                // Fall back to cookie-only upgrade (same-origin WS only).
            }
            if (cancelled) return

            let serverWsUrl: string | null = null
            try {
                const cfg = await fetch("/api/ws-config", { credentials: "include" })
                if (cfg.ok) {
                    const data = (await cfg.json()) as { wsUrl?: unknown }
                    if (typeof data.wsUrl === "string" && data.wsUrl.length > 0) {
                        serverWsUrl = data.wsUrl
                    }
                }
            } catch {
                // Same-origin default below.
            }
            if (cancelled) return

            // Dev: bot WS on BOT_API_PORT (via /api/ws-config when fetch succeeds). Fallback uses NEXT_PUBLIC_BOT_API_PORT.
            const protocol = window.location.protocol === "https:" ? "wss" : "ws"
            const devWsPort =
                (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BOT_API_PORT?.trim()) ||
                "3001"
            const base =
                serverWsUrl ||
                (process.env.NODE_ENV === "development"
                    ? `${protocol}://${window.location.hostname}:${devWsPort}/ws`
                    : `${protocol}://${window.location.host}/ws`)

            const url = new URL(base)
            if (ticket) {
                url.searchParams.set("ticket", ticket)
            }
            if (cancelled) return
            const socket = new WebSocket(url.toString())
            socketRef.current = socket

            socket.onopen = () => {
                reconnectAttemptsRef.current = 0
                setLiveUpdatesError(null)
                socket.send(JSON.stringify({ type: "subscribe", guildId }))
            }

            async function wsPayloadToString(data: MessageEvent["data"]): Promise<string> {
                if (typeof data === "string") return data
                if (data instanceof Blob) return data.text()
                if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
                if (ArrayBuffer.isView(data)) {
                    const view = data as ArrayBufferView
                    return new TextDecoder().decode(
                        view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
                    )
                }
                return String(data)
            }

            socket.onmessage = (event) => {
                void (async () => {
                    let text: string
                    try {
                        text = await wsPayloadToString(event.data)
                    } catch {
                        console.warn("[usePlayerSocket] Ignoring unreadable WS payload")
                        return
                    }
                    let parsed: Partial<WSMessage> & {
                        state?: PlayerStateResponse
                        queue?: QueueTrackSummary[]
                        inVoiceWithBot?: boolean
                        botInVoiceChannel?: boolean
                        canQueueTracks?: boolean
                        message?: string
                        code?: string
                    }
                    try {
                        parsed = JSON.parse(text) as typeof parsed
                    } catch {
                        console.warn("[usePlayerSocket] Ignoring non-JSON WS payload:", text)
                        return
                    }

                    if (parsed.type === "error" && typeof parsed.message === "string") {
                        setLiveUpdatesError(parsed.message)
                        return
                    }

                    if (parsed.type === "subscribed") {
                        setIsConnected(true)
                        reconnectAttemptsRef.current = 0
                        setLiveUpdatesError(null)
                        return
                    }

                    if (parsed.type === "unsubscribed") {
                        setIsConnected(false)
                        reconnectAttemptsRef.current = 0
                        return
                    }

                    if (
                        parsed.type === "trackStart" ||
                        parsed.type === "trackEnd" ||
                        parsed.type === "playerPause" ||
                        parsed.type === "playerResume" ||
                        parsed.type === "queueUpdate" ||
                        parsed.type === "playerDestroy"
                    ) {
                        if (parsed.state) setPlayerState(sanitizePlayerState(parsed.state))
                        if (parsed.queue !== undefined) {
                            setQueue(
                                Array.isArray(parsed.queue)
                                    ? sanitizeQueueTrackSummaries(
                                          parsed.queue as QueueTrackSummary[]
                                      )
                                    : undefined
                            )
                        }
                        return
                    }

                    if (
                        parsed.type === "voiceStateChange" &&
                        typeof parsed.userId === "string" &&
                        parsed.userId === userId
                    ) {
                        setPlayerState((prev) =>
                            prev
                                ? {
                                      ...prev,
                                      inVoiceWithBot: Boolean(parsed.inVoiceWithBot),
                                      botInVoiceChannel: Boolean(parsed.botInVoiceChannel),
                                      canQueueTracks: Boolean(parsed.canQueueTracks),
                                  }
                                : prev
                        )
                    }
                })().catch((err: unknown) => {
                    console.error("[usePlayerSocket] unexpected WS handler error", err)
                    setLiveUpdatesError("Unexpected socket error")
                })
            }

            socket.onclose = () => {
                setIsConnected(false)
                socketRef.current = null
                if (cancelled) return
                const nextAttempt = reconnectAttemptsRef.current + 1
                if (nextAttempt > MAX_RECONNECT_ATTEMPTS) {
                    setLiveUpdatesError(
                        "Live updates disconnected after repeated failures. Refresh the page to try again."
                    )
                    return
                }
                reconnectAttemptsRef.current = nextAttempt
                const delay = Math.min(30000, 1000 * 2 ** (reconnectAttemptsRef.current - 1))
                reconnectTimer = setTimeout(() => {
                    if (cancelled) return
                    void (async () => {
                        try {
                            await connect()
                        } catch (error: unknown) {
                            console.error("[usePlayerSocket] reconnect failed", error)
                            setLiveUpdatesError("Live updates reconnect failed.")
                        }
                    })()
                }, delay)
            }

            socket.onerror = () => {
                socket.close()
            }
        }

        void connect()

        return () => {
            cancelled = true
            setIsConnected(false)
            if (reconnectTimer) {
                clearTimeout(reconnectTimer)
            }
            socketRef.current?.close()
        }
    }, [guildId, userId])

    return { isConnected, playerState, queue, liveUpdatesError }
}
