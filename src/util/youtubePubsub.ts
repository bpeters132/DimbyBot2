import { createHmac, timingSafeEqual } from "node:crypto"
import { youtubeChannelIdFromTopic, youtubePubsubTopic } from "./youtubeFeedParse.js"

export const YOUTUBE_PUBSUB_PATH = "/youtube/pubsub"
export const YOUTUBE_PUBSUB_HUB = "https://pubsubhubbub.appspot.com/subscribe"

const DEFAULT_LEASE_SECONDS = 5 * 24 * 60 * 60

/** True when the Bot HTTP path is the YouTube PubSub callback (with or without trailing slash). */
export function isYoutubePubsubPath(pathname: string): boolean {
    return pathname === YOUTUBE_PUBSUB_PATH || pathname === `${YOUTUBE_PUBSUB_PATH}/`
}

export function youtubePubsubCallbackUrlFromEnv(
    env: NodeJS.Dict<string> = process.env
): string | null {
    const url = env.YOUTUBE_PUBSUB_CALLBACK_URL?.trim()
    if (!url) return null
    try {
        const parsed = new URL(url)
        if (parsed.protocol !== "https:") return null
        return parsed.toString()
    } catch {
        return null
    }
}

export function youtubePubsubHubSecretFromEnv(
    env: NodeJS.Dict<string> = process.env
): string | null {
    const secret = env.YOUTUBE_PUBSUB_HUB_SECRET?.trim()
    return secret || null
}

/** Verifies `X-Hub-Signature` / `X-Hub-Signature-256` when a hub secret is configured. */
export function verifyYoutubePubsubSignature(
    body: Buffer,
    headers: { signature?: string | string[]; signature256?: string | string[] },
    secret: string
): boolean {
    const sha256 = headerValue(headers.signature256)
    const sha1 = headerValue(headers.signature)
    if (sha256?.startsWith("sha256=")) {
        return hmacEquals(body, secret, "sha256", sha256.slice("sha256=".length))
    }
    if (sha1?.startsWith("sha1=")) {
        return hmacEquals(body, secret, "sha1", sha1.slice("sha1=".length))
    }
    return false
}

function headerValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value
}

function hmacEquals(
    body: Buffer,
    secret: string,
    algo: "sha1" | "sha256",
    expectedHex: string
): boolean {
    const digest = createHmac(algo, secret).update(body).digest("hex")
    const expected = expectedHex.trim().toLowerCase()
    if (digest.length !== expected.length) return false
    try {
        return timingSafeEqual(Buffer.from(digest), Buffer.from(expected))
    } catch {
        return false
    }
}

export type YoutubePubsubVerifyQuery = {
    "hub.mode"?: string
    "hub.topic"?: string
    "hub.challenge"?: string
    "hub.lease_seconds"?: string
}

/**
 * Handles the hub's GET verification challenge.
 * Accepts subscribe/unsubscribe for YouTube channel topics we know about.
 */
export function youtubePubsubVerifyResponse(
    query: YoutubePubsubVerifyQuery,
    knownChannelIds: ReadonlySet<string>
): { status: number; body: string } {
    const mode = query["hub.mode"]
    const topic = query["hub.topic"]
    const challenge = query["hub.challenge"]
    if ((mode !== "subscribe" && mode !== "unsubscribe") || !topic || challenge == null) {
        return { status: 400, body: "Bad request" }
    }
    const channelId = youtubeChannelIdFromTopic(topic)
    if (!channelId || !knownChannelIds.has(channelId)) {
        return { status: 404, body: "Unknown topic" }
    }
    return { status: 200, body: challenge }
}

export type PubsubSubscribeFn = (input: {
    mode: "subscribe" | "unsubscribe"
    topic: string
    callbackUrl: string
    secret: string | null
    leaseSeconds: number
}) => Promise<{ ok: boolean; status: number }>

async function defaultSubscribe(input: {
    mode: "subscribe" | "unsubscribe"
    topic: string
    callbackUrl: string
    secret: string | null
    leaseSeconds: number
}): Promise<{ ok: boolean; status: number }> {
    const body = new URLSearchParams({
        "hub.callback": input.callbackUrl,
        "hub.topic": input.topic,
        "hub.verify": "async",
        "hub.mode": input.mode,
        "hub.lease_seconds": String(input.leaseSeconds),
    })
    if (input.secret) body.set("hub.secret", input.secret)
    const res = await fetch(YOUTUBE_PUBSUB_HUB, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(15_000),
    })
    return { ok: res.ok, status: res.status }
}

/** Subscribes or unsubscribes a YouTube channel at the Google PubSub hub. */
export async function requestYoutubePubsub(
    mode: "subscribe" | "unsubscribe",
    channelId: string,
    options: {
        callbackUrl: string | null
        secret: string | null
        leaseSeconds?: number
        subscribe?: PubsubSubscribeFn
    }
): Promise<{ ok: boolean; status: number } | { skipped: true }> {
    if (!options.callbackUrl) return { skipped: true }
    const subscribe = options.subscribe ?? defaultSubscribe
    return subscribe({
        mode,
        topic: youtubePubsubTopic(channelId),
        callbackUrl: options.callbackUrl,
        secret: options.secret,
        leaseSeconds: options.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
    })
}

/** Default lease length we request (YouTube may grant a different value). */
export function defaultYoutubePubsubLeaseMs(): number {
    return DEFAULT_LEASE_SECONDS * 1000
}
