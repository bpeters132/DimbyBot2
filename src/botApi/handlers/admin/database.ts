import { requireDeveloperAccess } from "../../../shared/api-auth.js"
import { getPrismaClient } from "../../../lib/database.js"
import type { ApiResponse } from "../../../types/index.js"

export interface AdminDbStatsResponse {
    sessions: { total: number; expired: number }
    verifications: { total: number; expired: number }
}

export type AdminDbCleanupTarget = "sessions" | "verifications" | "all"

export interface AdminDbCleanupBody {
    target: AdminDbCleanupTarget
}

export interface AdminDbCleanupResponse {
    dryRun: boolean
    deleted: { sessions?: number; verifications?: number }
}

function expiredWhere() {
    return { expiresAt: { lt: new Date() } }
}

function isCleanupTarget(value: unknown): value is AdminDbCleanupTarget {
    return value === "sessions" || value === "verifications" || value === "all"
}

export async function adminDbStatsGET(
    headers: Headers
): Promise<{ status: number; body: ApiResponse<AdminDbStatsResponse> }> {
    const guard = await requireDeveloperAccess(headers)
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    const prisma = getPrismaClient()
    const expiredFilter = expiredWhere()

    const [sessionsTotal, sessionsExpired, verificationsTotal, verificationsExpired] =
        await Promise.all([
            prisma.session.count(),
            prisma.session.count({ where: expiredFilter }),
            prisma.verification.count(),
            prisma.verification.count({ where: expiredFilter }),
        ])

    return {
        status: 200,
        body: {
            ok: true,
            data: {
                sessions: { total: sessionsTotal, expired: sessionsExpired },
                verifications: { total: verificationsTotal, expired: verificationsExpired },
            },
        },
    }
}

export async function adminDbCleanupPOST(
    headers: Headers,
    rawBody: unknown,
    query: URLSearchParams
): Promise<{ status: number; body: ApiResponse<AdminDbCleanupResponse> }> {
    const guard = await requireDeveloperAccess(headers)
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    const body = rawBody as AdminDbCleanupBody | null
    const target = body?.target
    if (!isCleanupTarget(target)) {
        return {
            status: 400,
            body: {
                ok: false,
                error: {
                    error: "Invalid request",
                    details: 'Body must include target: "sessions", "verifications", or "all".',
                },
            },
        }
    }

    const dryRun = query.get("dryRun") === "true"
    const prisma = getPrismaClient()
    const where = expiredWhere()
    const deleted: AdminDbCleanupResponse["deleted"] = {}

    if (target === "sessions" || target === "all") {
        if (dryRun) {
            deleted.sessions = await prisma.session.count({ where })
        } else {
            const result = await prisma.session.deleteMany({ where })
            deleted.sessions = result.count
        }
    }

    if (target === "verifications" || target === "all") {
        if (dryRun) {
            deleted.verifications = await prisma.verification.count({ where })
        } else {
            const result = await prisma.verification.deleteMany({ where })
            deleted.verifications = result.count
        }
    }

    return {
        status: 200,
        body: { ok: true, data: { dryRun, deleted } },
    }
}
