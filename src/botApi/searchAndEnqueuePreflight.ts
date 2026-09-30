import type { ApiErrorPayload } from "../types/index.js"

/** Voice/guild checks that run before search/connect. Distinct from 409 live-player race. */
export type SearchAndEnqueuePreflightKind =
    | "guild_missing"
    | "member_fetch_transient"
    | "not_in_voice"
    | "bot_not_ready"
    | "join_perms_unknown"
    | "join_perms_denied"
    | "occupied_voice_mismatch"

export type SearchAndEnqueuePreflightFailure = {
    ok: false
    status: number
    error: ApiErrorPayload
}

const PREFLIGHT: Record<SearchAndEnqueuePreflightKind, SearchAndEnqueuePreflightFailure> = {
    guild_missing: {
        ok: false,
        status: 404,
        error: { error: "Guild not found in bot cache." },
    },
    member_fetch_transient: {
        ok: false,
        status: 503,
        error: { error: "Unable to verify voice state, please try again." },
    },
    not_in_voice: {
        ok: false,
        status: 400,
        error: { error: "Join a voice channel first." },
    },
    bot_not_ready: {
        ok: false,
        status: 503,
        error: { error: "Bot not ready; cannot verify voice permissions." },
    },
    join_perms_unknown: {
        ok: false,
        status: 403,
        error: { error: "Could not determine bot permissions for this voice channel." },
    },
    join_perms_denied: {
        ok: false,
        status: 403,
        error: { error: "Bot lacks permission to join this voice channel." },
    },
    occupied_voice_mismatch: {
        ok: false,
        status: 403,
        error: { error: "You need to be in the same voice channel as the bot." },
    },
}

/**
 * Maps dashboard play/queue voice-setup failures to HTTP status + copy.
 * Guild missing is 404, transient member fetch is 503 (not 404), join-VC is 400,
 * and occupied-VC / join-perm denials stay 403 — not 409 player-race.
 */
export function mapSearchAndEnqueuePreflightFailure(
    kind: SearchAndEnqueuePreflightKind
): SearchAndEnqueuePreflightFailure {
    return PREFLIGHT[kind]
}
