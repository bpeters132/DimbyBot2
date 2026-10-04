import { WebPermission } from "./permissions.js"
import type { GuildDashboardSnapshotResult } from "../types/web.js"

type SnapshotFailure = Extract<GuildDashboardSnapshotResult, { ok: false }>

export type DashboardPermissionSnapshotOriginKind = "invalid" | "unset"

/** Upstream HTTP status when the bot answered but the body cannot be used as JSON. */
export function dashboardPermissionSnapshotUpstreamStatus(httpStatus: number): number {
    return httpStatus >= 400 ? httpStatus : 502
}

/**
 * Maps a missing vs invalid `API_PROXY_TARGET` when the Dashboard loads permissions from the bot.
 * Both are 503; copy must stay distinct from {@link mapDashboardPermissionSnapshotUnreachable}
 * and from `serverFetchBot`'s nested origin envelope.
 */
export function mapDashboardPermissionSnapshotOriginFailure(
    kind: DashboardPermissionSnapshotOriginKind
): SnapshotFailure {
    if (kind === "invalid") {
        return {
            ok: false,
            status: 503,
            error: "Bot API misconfigured",
            details:
                "API_PROXY_TARGET is invalid. Set it to the bot HTTP origin (origin only, no path).",
        }
    }
    return {
        ok: false,
        status: 503,
        error: "Bot API not configured",
        details:
            "Set API_PROXY_TARGET to your bot HTTP origin (e.g. http://localhost:3001 locally, or http://dimbybot:3001 in Docker).",
    }
}

/**
 * Maps a thrown upstream `fetch` while loading the permission snapshot.
 * Stays 503 (retryable) — not the 502 `serverFetchBot` / `proxyBotApi` unreachable status.
 */
export function mapDashboardPermissionSnapshotUnreachable(): SnapshotFailure {
    return {
        ok: false,
        status: 503,
        error: "Bot API unreachable",
        details:
            "Could not reach the bot HTTP server for permission data. Confirm the bot is running and API_PROXY_TARGET matches BOT_API_PORT.",
    }
}

/**
 * Maps a non-JSON bot response. HTTP 404 keeps the "older bot build" copy; other statuses
 * stay "Invalid bot response". Statuses below 400 collapse to 502.
 */
export function mapDashboardPermissionSnapshotNonJsonResponse(httpStatus: number): SnapshotFailure {
    const status = dashboardPermissionSnapshotUpstreamStatus(httpStatus)
    if (httpStatus === 404) {
        return {
            ok: false,
            status,
            error: "Dashboard permission route not found",
            details:
                "The bot process may be running an older build without GET /api/guilds/:guildId/dashboard-permissions — rebuild the bot (yarn build:bot) and restart it.",
        }
    }
    return {
        ok: false,
        status,
        error: "Invalid bot response",
        details: "Expected JSON from the bot API for dashboard permissions.",
    }
}

/** Maps a JSON parse failure on an otherwise received bot response. */
export function mapDashboardPermissionSnapshotMalformedJson(httpStatus: number): SnapshotFailure {
    return {
        ok: false,
        status: dashboardPermissionSnapshotUpstreamStatus(httpStatus),
        error: "Invalid bot response",
        details: "The bot API returned malformed JSON for dashboard permissions.",
    }
}

/**
 * In-process permission resolution threw. Distinct from bot-not-ready and from the
 * Dashboard action crash ("Service unavailable").
 */
export function mapDashboardPermissionSnapshotResolutionFailure(): SnapshotFailure {
    return {
        ok: false,
        status: 503,
        error: "Permission check unavailable",
        details:
            "Could not load dashboard permissions for this server. Try again shortly or refresh the page.",
    }
}

function snapshotErrorMessageFromPayload(body: Record<string, unknown>): string {
    if (typeof body.error === "string") return body.error
    const nested = body.error
    if (nested && typeof nested === "object" && nested !== null && "error" in nested) {
        const inner = (nested as { error?: unknown }).error
        if (typeof inner === "string") return inner
    }
    return "Request failed"
}

function snapshotErrorDetailsFromPayload(body: Record<string, unknown>): string | undefined {
    if (typeof body.details === "string") return body.details
    const nested = body.error
    if (nested && typeof nested === "object" && nested !== null && "details" in nested) {
        const d = (nested as { details?: unknown }).details
        if (typeof d === "string") return d
    }
    return undefined
}

/**
 * Maps bot Express JSON (including generic `{ ok: false, error: { error } }` errors) into
 * {@link GuildDashboardSnapshotResult}.
 */
export function normalizeDashboardPermissionSnapshotResponse(
    parsed: unknown,
    httpStatus: number
): GuildDashboardSnapshotResult {
    if (!parsed || typeof parsed !== "object" || !("ok" in parsed)) {
        return {
            ok: false,
            status: httpStatus >= 400 ? httpStatus : 502,
            error: "Invalid bot response",
            details: "The bot API returned an unexpected payload for dashboard permissions.",
        }
    }
    const body = parsed as Record<string, unknown>
    if (body.ok === false) {
        const statusRaw =
            typeof body.status === "number" && Number.isFinite(body.status)
                ? Math.floor(body.status)
                : httpStatus >= 400
                  ? httpStatus
                  : 502
        const status = statusRaw >= 400 && statusRaw <= 599 ? statusRaw : 502
        return {
            ok: false,
            status,
            error: snapshotErrorMessageFromPayload(body),
            details: snapshotErrorDetailsFromPayload(body),
        }
    }
    if (body.ok !== true) {
        return {
            ok: false,
            status: 502,
            error: "Invalid bot response",
            details: "The bot API returned an unexpected `ok` field for dashboard permissions.",
        }
    }

    const discordUserId = body.discordUserId
    if (typeof discordUserId !== "string") {
        return {
            ok: false,
            status: 502,
            error: "Invalid bot response",
            details: "Dashboard permission snapshot is missing `discordUserId`.",
        }
    }

    const snap = body.snapshot
    if (!snap || typeof snap !== "object") {
        return {
            ok: false,
            status: 502,
            error: "Invalid bot response",
            details: "Dashboard permission snapshot is missing `snapshot`.",
        }
    }
    const s = snap as Record<string, unknown>
    const primary = s.primaryPermissions
    const oauth = s.oauthPermissions
    const allowedWebPermissions = new Set<string>(Object.values(WebPermission))
    const isValidPermissionList = (value: unknown): value is string[] =>
        Array.isArray(value) &&
        value.every((p) => typeof p === "string" && allowedWebPermissions.has(p))
    if (!isValidPermissionList(primary) || !isValidPermissionList(oauth)) {
        return {
            ok: false,
            status: 502,
            error: "Invalid bot response",
            details: "Dashboard permission snapshot has invalid permission arrays.",
        }
    }

    return {
        ok: true,
        snapshot: {
            memberResolved: Boolean(s.memberResolved),
            primaryPermissions: primary,
            oauthPermissions: oauth,
            ...(typeof s.optimisticBotUnavailable === "boolean"
                ? { optimisticBotUnavailable: s.optimisticBotUnavailable }
                : {}),
        },
        discordUserId,
    }
}

/**
 * Fail-closed when the bot HTTP snapshot is for a different Discord user than this session.
 * Upstream failures pass through unchanged so a 503 is not rewritten as Forbidden.
 */
export function applyPermissionSnapshotSessionCheck(
    sessionDiscordUserId: string,
    upstream: GuildDashboardSnapshotResult
): GuildDashboardSnapshotResult {
    if (upstream.ok === true && upstream.discordUserId !== sessionDiscordUserId) {
        return {
            ok: false,
            status: 403,
            error: "Forbidden",
            details: "Permission snapshot could not be verified for this session.",
        }
    }
    return upstream
}
