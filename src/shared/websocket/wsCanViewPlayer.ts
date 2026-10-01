/** Denial codes shared by subscribe-time checks and in-flight force-unsubscribe. */
export type WsViewPlayerDenialCode =
    | "BOT_UNAVAILABLE"
    | "SUBSCRIBE_FORBIDDEN"
    | "PERMISSION_RESOLUTION_ERROR"

export type WsCanViewPlayerDecision =
    | { allowed: true }
    | { allowed: false; code: WsViewPlayerDenialCode }

export type WsViewPlayerErrorFrame = {
    type: "error"
    code: WsViewPlayerDenialCode
    message: string
}

/** Copy sent when a live subscription is torn down. Distinct from subscribe-time denial copy. */
export const WS_FORCE_UNSUBSCRIBE_MESSAGE =
    "Live updates were removed because your access to this guild player changed."

const SUBSCRIBE_BOT_UNAVAILABLE_MESSAGE =
    "Live updates require the bot process to be running with this dashboard."

const SUBSCRIBE_PERMISSION_RESOLUTION_ERROR_MESSAGE =
    "Could not resolve permissions for this subscription request."

const SUBSCRIBE_FORBIDDEN_MESSAGE =
    "Live updates are blocked: the bot could not verify your access to this server’s player (sign in with Discord, same account as in the server). This is not about voice channels or whether music is playing."

/**
 * Decides whether a socket may view (or keep viewing) a guild player.
 * Bot-not-ready wins so an outage is `BOT_UNAVAILABLE`, not forbidden.
 * A failed permission lookup is `PERMISSION_RESOLUTION_ERROR`, not `SUBSCRIBE_FORBIDDEN`.
 */
export function mapWsCanViewPlayer(input: {
    botReady: boolean
    permissionResolutionFailed: boolean
    hasViewPlayer: boolean
}): WsCanViewPlayerDecision {
    if (!input.botReady) {
        return { allowed: false, code: "BOT_UNAVAILABLE" }
    }
    if (input.permissionResolutionFailed) {
        return { allowed: false, code: "PERMISSION_RESOLUTION_ERROR" }
    }
    if (!input.hasViewPlayer) {
        return { allowed: false, code: "SUBSCRIBE_FORBIDDEN" }
    }
    return { allowed: true }
}

/**
 * Error frame after force-unsubscribe. Same access-changed copy for every code — this client
 * already had a live subscription that is being removed.
 */
export function forceUnsubscribeErrorFrame(code: WsViewPlayerDenialCode): WsViewPlayerErrorFrame {
    return {
        type: "error",
        code,
        message: WS_FORCE_UNSUBSCRIBE_MESSAGE,
    }
}

export function forceUnsubscribeUnsubscribedFrame(guildId: string): {
    type: "unsubscribed"
    guildId: string
} {
    return { type: "unsubscribed", guildId }
}

/**
 * Subscribe-time denial copy. Same codes as force-unsubscribe, different messages: the client
 * never obtained a live subscription, so "access changed" would be wrong.
 */
export function subscribeDenialErrorFrame(code: WsViewPlayerDenialCode): WsViewPlayerErrorFrame {
    if (code === "BOT_UNAVAILABLE") {
        return { type: "error", code, message: SUBSCRIBE_BOT_UNAVAILABLE_MESSAGE }
    }
    if (code === "PERMISSION_RESOLUTION_ERROR") {
        return { type: "error", code, message: SUBSCRIBE_PERMISSION_RESOLUTION_ERROR_MESSAGE }
    }
    return { type: "error", code, message: SUBSCRIBE_FORBIDDEN_MESSAGE }
}
