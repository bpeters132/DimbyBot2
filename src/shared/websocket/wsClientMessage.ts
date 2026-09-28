/** Parsed browser → bot player WebSocket frame (subscribe / unsubscribe / ping). */
export type ParsedWsClientMessage =
    | { kind: "ping" }
    | { kind: "subscribe"; guildId: string }
    | { kind: "unsubscribe"; guildId: string }
    | { kind: "error"; message: string }
    | { kind: "ignore" }

/**
 * Validates a raw WS text frame before permission resolution.
 * Non-object JSON (null, arrays, primitives) is rejected as invalid JSON rather than
 * throwing when reading `.type`. Unknown `type` values are ignored (no error frame).
 */
export function parseWsClientMessage(raw: string): ParsedWsClientMessage {
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return { kind: "error", message: "Invalid message JSON." }
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { kind: "error", message: "Invalid message JSON." }
    }
    const record = parsed as Record<string, unknown>
    if (record.type === "ping") {
        return { kind: "ping" }
    }
    if (record.type === "subscribe") {
        const guildId = record.guildId
        if (!guildId || typeof guildId !== "string") {
            return { kind: "error", message: "Invalid guildId for subscribe." }
        }
        return { kind: "subscribe", guildId }
    }
    if (record.type === "unsubscribe") {
        const guildId = record.guildId
        if (!guildId || typeof guildId !== "string") {
            return { kind: "error", message: "Invalid guildId for unsubscribe." }
        }
        return { kind: "unsubscribe", guildId }
    }
    return { kind: "ignore" }
}
