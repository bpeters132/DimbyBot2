import type { LavalinkManager } from "lavalink-client"
import { getPrismaClient } from "../lib/database.js"

export const STACK_STATUS_TIMEOUT_MS = 3000
export const COMPANION_SECRET_KEY_LENGTH = 16

export type HttpProbeResult = {
    ok: boolean
    status?: number
    error?: string
}

/** True when the companion secret is exactly 16 alphanumeric characters. */
export function companionKeyLengthOk(key: string): boolean {
    return /^[a-zA-Z0-9]{16}$/.test(key)
}

/** HTTP GET with a short timeout. Any response (including 4xx) means the host is reachable. */
export async function probeHttpReachable(
    url: string,
    timeoutMs = STACK_STATUS_TIMEOUT_MS,
    headers?: Record<string, string>
): Promise<HttpProbeResult> {
    try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        try {
            const res = await fetch(url, {
                method: "GET",
                redirect: "manual",
                signal: controller.signal,
                headers,
            })
            return { ok: true, status: res.status }
        } finally {
            clearTimeout(timer)
        }
    } catch (err: unknown) {
        const name = err instanceof Error ? err.name : "Error"
        return { ok: false, error: name }
    }
}

export async function probePostgres(timeoutMs = STACK_STATUS_TIMEOUT_MS): Promise<HttpProbeResult> {
    try {
        const timeout = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Timeout")), timeoutMs)
        })
        await Promise.race([getPrismaClient().$queryRaw`SELECT 1`, timeout])
        return { ok: true }
    } catch (err: unknown) {
        const name = err instanceof Error ? err.name : "Error"
        return { ok: false, error: name }
    }
}

export function lavalinkNodeSummary(lavalink: LavalinkManager): {
    nodeCount: number
    connected: number
} {
    const nodes = lavalink.nodeManager?.nodes
    if (!nodes || typeof nodes.values !== "function") {
        return { nodeCount: 0, connected: 0 }
    }
    let nodeCount = 0
    let connected = 0
    for (const node of nodes.values()) {
        nodeCount += 1
        if (node && typeof node === "object" && (node as { connected?: boolean }).connected) {
            connected += 1
        }
    }
    return { nodeCount, connected }
}

export function companionOriginFromEnv(): string {
    return (process.env.INVIDIOUS_COMPANION_URL ?? "http://invidious-companion:8282")
        .trim()
        .replace(/\/+$/, "")
}

export function ytCipherOriginFromEnv(): string {
    return (process.env.LAVALINK_YOUTUBE_CIPHER_URL ?? "http://yt-cipher:8001")
        .trim()
        .replace(/\/+$/, "")
}

export function lavalinkRestOriginFromEnv(): string {
    const host = (process.env.LAVALINK_HOST ?? "lavalink").trim()
    const port = (process.env.LAVALINK_PORT ?? "2333").trim()
    const secure = process.env.LAVALINK_SECURE?.toLowerCase() === "true"
    return `${secure ? "https" : "http"}://${host}:${port}`
}
