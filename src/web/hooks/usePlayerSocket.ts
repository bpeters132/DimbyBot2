"use client"

import { useEffect, useRef, useState } from "react"
import type { PlayerStateResponse, QueueTrackSummary, WSMessage } from "@/types/web"

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

    useEffect(() => {
        let cancelled = false

        const connect = async () => {
            if (cancelled) return

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

            // Dev: Next on :3000 and bot WS on :3001; override with NEXT_PUBLIC_WS_URL in other setups.
            const explicitWsUrl = process.env.NEXT_PUBLIC_WS_URL
            const protocol = window.location.protocol === "https:" ? "wss" : "ws"
            const base =
                explicitWsUrl ||
                (window.location.port === "3000"
                    ? `${protocol}://${window.location.hostname}:3001/ws`
                    : `${protocol}://${window.location.host}/ws`)

            const url = new URL(base)
            if (ticket) {
                url.searchParams.set("ticket", ticket)
            }
            if (cancelled) return
            const socket = new WebSocket(url.toString())
            socketRef.current = socket

            socket.onopen = () => {
                setIsConnected(true)
                reconnectAttemptsRef.current = 0
                setLiveUpdatesError(null)
                socket.send(JSON.stringify({ type: "subscribe", guildId }))
            }

            socket.onmessage = (event) => {
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
                    parsed = JSON.parse(event.data as string) as typeof parsed
                } catch {
                    console.warn("[usePlayerSocket] Ignoring non-JSON WS payload:", event.data)
                    return
                }

                if (parsed.type === "error" && typeof parsed.message === "string") {
                    setLiveUpdatesError(parsed.message)
                    return
                }

                if (parsed.type === "subscribed") {
                    setLiveUpdatesError(null)
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
                    if (parsed.state) setPlayerState(parsed.state)
                    if (parsed.queue !== undefined) setQueue(parsed.queue)
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
            }

            socket.onclose = () => {
                setIsConnected(false)
                if (cancelled) return
                reconnectAttemptsRef.current += 1
                const delay = Math.min(30000, 1000 * 2 ** reconnectAttemptsRef.current)
                setTimeout(() => {
                    if (!cancelled) {
                        void connect()
                    }
                }, delay)
            }

            socket.onerror = () => {
                socket.close()
            }
        }

        void connect()

        return () => {
            cancelled = true
            socketRef.current?.close()
        }
    }, [guildId, userId])

    return { isConnected, playerState, queue, liveUpdatesError }
}
