"use server"

import type { StatusPayload } from "@/types/web"
import { writeAuditLog } from "@/lib/audit-log"
import { sanitizeErrorForLog } from "../../shared/status-log-sanitize.js"
import { getServiceStatusPayload } from "@/server/service-status"

/** Probes database connectivity and bot `/health` for the status UI. */
export async function getServiceStatusAction(): Promise<StatusPayload> {
    try {
        return await getServiceStatusPayload()
    } catch (error: unknown) {
        const safe = sanitizeErrorForLog(error)
        try {
            writeAuditLog(
                "error",
                "SERVICE_STATUS_PROBE_FAILED",
                "[status.actions] service status probe failed",
                {
                    action: "SERVICE_STATUS_PROBE",
                    category: "service",
                    source: "status.actions",
                    severity: "error",
                    outcome: "failure",
                    actor: "system",
                    request: null,
                    error: safe,
                }
            )
        } catch (auditError: unknown) {
            const auditErrorName = auditError instanceof Error ? auditError.name : "unknown"
            console.warn(
                "[status.actions] audit log failed during status probe fallback",
                auditErrorName
            )
        }
        return {
            ok: false,
            checkedAt: new Date().toISOString(),
            database: { ok: false, message: "Status probe failed" },
            botApi: { ok: false, message: "Status probe failed" },
        }
    }
}
