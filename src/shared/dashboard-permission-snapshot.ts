import { WebPermission } from "./permissions.js"
import type { GuildDashboardSnapshotResult } from "../types/web.js"

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
