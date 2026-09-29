import type { StatusPayload } from "@/types/web"

export const DATABASE_PROBE_UNREACHABLE = "Database unreachable"
export const SERVICE_STATUS_CRASH_MESSAGE = "Status check failed"

export type BotApiOriginProbeKind = "invalid_parse" | "unset" | "invalid_origin"

/** Operator-facing copy when the dashboard cannot even build a bot /health URL. */
export function mapBotApiOriginProbeMessage(kind: BotApiOriginProbeKind): string {
    switch (kind) {
        case "invalid_parse":
            return "API_PROXY_TARGET is invalid; cannot probe bot /health."
        case "unset":
            return "API_PROXY_TARGET is not set; cannot probe bot /health in this environment."
        case "invalid_origin":
            return "API_PROXY_TARGET is not a valid origin; cannot probe bot /health."
    }
}

export type BotHealthProbeFailure =
    | { kind: "http"; status: number }
    | { kind: "timeout" }
    | { kind: "request_failed" }

/** Maps a bot /health probe miss to the public status payload message. */
export function mapBotHealthProbeFailure(failure: BotHealthProbeFailure): string {
    if (failure.kind === "http") {
        return `Bot /health returned HTTP ${failure.status}`
    }
    if (failure.kind === "timeout") {
        return "Timed out connecting to bot /health"
    }
    return "Bot /health request failed"
}

/**
 * Public `/api/status` envelope when {@link getServiceStatusPayload} itself throws.
 * Must stay 503-shaped (not a 500 crash) so monitors keep a stable contract.
 */
export function mapServiceStatusProbeCrash(checkedAt: string): StatusPayload {
    return {
        ok: false,
        checkedAt,
        database: { ok: false, message: SERVICE_STATUS_CRASH_MESSAGE },
        botApi: { ok: false, message: SERVICE_STATUS_CRASH_MESSAGE },
    }
}
