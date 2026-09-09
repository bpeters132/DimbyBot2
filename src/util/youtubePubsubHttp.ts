import type { IncomingMessage, ServerResponse } from "node:http"
import type { Client } from "discord.js"
import type { LoggerInterface } from "../types/index.js"
import { getUniqueYoutubeChannelIds } from "./youtubeAlertStore.js"
import { parseYoutubeAtomFeed, youtubeChannelIdFromTopic } from "./youtubeFeedParse.js"
import { loggerFromPartial } from "./loggerFromPartial.js"
import {
    isYoutubePubsubPath,
    verifyYoutubePubsubSignature,
    youtubePubsubHubSecretFromEnv,
    youtubePubsubVerifyResponse,
} from "./youtubePubsub.js"
import { processYoutubeFeedEntries } from "./youtubeUploadMonitor.js"

export { isYoutubePubsubPath }

const MAX_BODY_BYTES = 512 * 1024

function queryFromUrl(url: string | undefined): Record<string, string> {
    try {
        const parsed = new URL(url || "/", "http://localhost")
        const out: Record<string, string> = {}
        for (const [key, value] of parsed.searchParams.entries()) {
            out[key] = value
        }
        return out
    } catch {
        return {}
    }
}

function header(req: IncomingMessage, name: string): string | undefined {
    const raw = req.headers[name.toLowerCase()]
    return Array.isArray(raw) ? raw[0] : raw
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = []
        let size = 0
        req.on("data", (chunk: Buffer) => {
            size += chunk.length
            if (size > limit) {
                reject(new Error("body too large"))
                req.destroy()
                return
            }
            chunks.push(chunk)
        })
        req.on("end", () => resolve(Buffer.concat(chunks)))
        req.on("error", reject)
    })
}

/**
 * GET challenge + POST Atom handler for `/youtube/pubsub`.
 * Not part of the Bot API; callers must skip the private-IP gate for this path.
 */
export async function handleYoutubePubsubRequest(
    req: IncomingMessage,
    res: ServerResponse,
    client: Client | null,
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = loggerFromPartial(loggerInstance)
    const method = (req.method || "GET").toUpperCase()
    if (method === "GET") {
        const query = queryFromUrl(req.url)
        let known: Set<string>
        try {
            known = new Set(getUniqueYoutubeChannelIds())
        } catch {
            res.statusCode = 503
            res.setHeader("Content-Type", "text/plain; charset=utf-8")
            res.end("Store not ready")
            return
        }
        const result = youtubePubsubVerifyResponse(query, known)
        if (result.status === 200 && query["hub.lease_seconds"]) {
            const topic = query["hub.topic"]
            const channelId = topic ? youtubeChannelIdFromTopic(topic) : null
            const leaseSec = Number(query["hub.lease_seconds"])
            if (channelId && Number.isFinite(leaseSec) && leaseSec > 0) {
                const { saveYoutubeChannelLease } = await import("./youtubeAlertStore.js")
                await saveYoutubeChannelLease(channelId, new Date(Date.now() + leaseSec * 1000))
            }
        }
        res.statusCode = result.status
        res.setHeader("Content-Type", "text/plain; charset=utf-8")
        res.end(result.body)
        return
    }
    if (method !== "POST") {
        res.statusCode = 405
        res.end("Method Not Allowed")
        return
    }
    let body: Buffer
    try {
        body = await readBody(req, MAX_BODY_BYTES)
    } catch {
        res.statusCode = 413
        res.end("Payload Too Large")
        return
    }
    const secret = youtubePubsubHubSecretFromEnv()
    if (!secret) {
        logger.warn("[yt-alerts] PubSub POST rejected: YOUTUBE_PUBSUB_HUB_SECRET is unset.")
        res.statusCode = 403
        res.end("Forbidden")
        return
    }
    const ok = verifyYoutubePubsubSignature(
        body,
        {
            signature: header(req, "x-hub-signature"),
            signature256: header(req, "x-hub-signature-256"),
        },
        secret
    )
    if (!ok) {
        logger.warn("[yt-alerts] PubSub POST rejected: bad hub signature.")
        res.statusCode = 403
        res.end("Forbidden")
        return
    }
    const xml = body.toString("utf8")
    const { entries } = parseYoutubeAtomFeed(xml)
    const channelId = entries[0]?.channelId
    if (client && channelId) {
        try {
            await processYoutubeFeedEntries(client, channelId, entries, undefined, logger)
        } catch (error: unknown) {
            logger.warn("[yt-alerts] PubSub notify failed:", error)
        }
    }
    res.statusCode = 204
    res.end()
}
