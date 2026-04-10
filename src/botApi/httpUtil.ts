import type { IncomingMessage } from "http"

/** Builds a Fetch API `Headers` from an Node HTTP request (Express/IncomingMessage). */
export function incomingMessageToHeaders(req: IncomingMessage): Headers {
    const h = new Headers()
    const raw = req.headers
    for (const key of Object.keys(raw)) {
        const v = raw[key]
        if (typeof v === "string") {
            h.set(key, v)
        } else if (Array.isArray(v)) {
            for (const item of v) {
                h.append(key, item)
            }
        }
    }
    return h
}
