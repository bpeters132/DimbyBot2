import { requireDeveloperAccess } from "../../../shared/api-auth.js"
import {
    clearErrorHistory,
    getErrorsByGuild,
    getRecentErrors,
    type ErrorHistoryEntry,
} from "../../../lib/errorHistory.js"
import type { ApiResponse } from "../../../types/index.js"

export interface AdminErrorsListResponse {
    entries: ErrorHistoryEntry[]
}

export interface AdminErrorsClearResponse {
    cleared: true
}

function parseLimit(raw: string | null): number {
    if (!raw) return 100
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) return 100
    return Math.max(1, Math.min(n, 500))
}

export async function adminErrorsGET(
    headers: Headers,
    query: URLSearchParams
): Promise<{ status: number; body: ApiResponse<AdminErrorsListResponse> }> {
    const guard = await requireDeveloperAccess(headers)
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    const limit = parseLimit(query.get("limit"))
    const guildId = query.get("guildId")?.trim()
    const entries = guildId ? getErrorsByGuild(guildId, limit) : getRecentErrors(limit)

    return {
        status: 200,
        body: { ok: true, data: { entries } },
    }
}

export async function adminErrorsDELETE(
    headers: Headers
): Promise<{ status: number; body: ApiResponse<AdminErrorsClearResponse> }> {
    const guard = await requireDeveloperAccess(headers)
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    clearErrorHistory()
    return {
        status: 200,
        body: { ok: true, data: { cleared: true } },
    }
}
