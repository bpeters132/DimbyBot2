import { createHmac, timingSafeEqual } from "crypto"

const SEP = "."

/**
 * Signed, short-lived token so the browser can open a WebSocket on the bot port (different origin)
 * where session cookies are not sent. Minted by Next (`GET /api/ws-ticket`), verified on upgrade.
 */
function wsConnectHmacKey(secret: string): Buffer {
    return Buffer.from(secret, "utf8")
}

export function createWsConnectToken(userId: string, secret: string, ttlSeconds = 120): string {
    const key = wsConnectHmacKey(secret)
    if (!key.length) {
        throw new Error("empty secret for createWsConnectToken")
    }
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds
    const payload = Buffer.from(JSON.stringify({ userId, exp }), "utf8").toString("base64url")
    const sig = createHmac("sha256", key).update(payload).digest("base64url")
    return `${payload}${SEP}${sig}`
}

/** Returns Discord user id or null if invalid / expired. */
export function parseWsConnectToken(token: string, secret: string): string | null {
    const key = wsConnectHmacKey(secret)
    if (!key.length) {
        return null
    }
    const i = token.lastIndexOf(SEP)
    if (i <= 0) return null
    const payload = token.slice(0, i)
    const sig = token.slice(i + 1)
    const expected = createHmac("sha256", key).update(payload).digest("base64url")
    try {
        if (
            sig.length !== expected.length ||
            !timingSafeEqual(Buffer.from(sig, "base64url"), Buffer.from(expected, "base64url"))
        ) {
            return null
        }
    } catch {
        return null
    }
    let data: { userId: string; exp: number }
    try {
        data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    } catch {
        return null
    }
    if (typeof data.userId !== "string") return null
    if (typeof data.exp !== "number" || !Number.isFinite(data.exp) || !Number.isInteger(data.exp))
        return null
    if (data.exp <= Math.floor(Date.now() / 1000)) return null
    return data.userId
}
