"use server"

import type { StatusPayload } from "@/types/web"
import { writeAuditLog } from "@/lib/audit-log"
import { sanitizeErrorText } from "@/lib/sanitize-log-text"
import { getServiceStatusPayload } from "@/server/service-status"

const SENSITIVE_KEY = /\b(?:password|secret|token|uri|connectionString|connection|host|headers)\b/i
const SANITIZE_MAX_DEPTH = 10

function stringLooksLikeHostOrDsn(value: string): boolean {
    if (/:\/\//.test(value)) {
        return true
    }
    if (/\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(value)) {
        return true
    }
    if (/[.][a-z0-9-]{2,}:\d{2,5}\b/i.test(value)) {
        return true
    }
    return false
}

function sanitizeParsedForLog(value: unknown, depth = 0, visited = new WeakSet<object>()): unknown {
    if (depth > SANITIZE_MAX_DEPTH) {
        return "[too_deep]"
    }
    if (Array.isArray(value)) {
        if (visited.has(value)) {
            return "[circular]"
        }
        visited.add(value)
        return value.map((item) => sanitizeParsedForLog(item, depth + 1, visited))
    }
    if (value && typeof value === "object") {
        const objectValue = value as Record<string, unknown>
        if (visited.has(objectValue)) {
            return "[circular]"
        }
        visited.add(objectValue)
        const obj = value as Record<string, unknown>
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(obj)) {
            if (SENSITIVE_KEY.test(k)) {
                out[k] = "[redacted]"
                continue
            }
            if (typeof v === "string") {
                if (stringLooksLikeHostOrDsn(v)) {
                    out[k] = "[redacted]"
                } else {
                    out[k] = sanitizeErrorText(v, 800)
                }
                continue
            }
            out[k] = sanitizeParsedForLog(v, depth + 1, visited)
        }
        return out
    }
    if (typeof value === "string") {
        if (stringLooksLikeHostOrDsn(value)) {
            return "[redacted]"
        }
        return sanitizeErrorText(value, 800)
    }
    return value
}

function sanitizeErrorForLog(error: unknown): { name?: string; message: string } {
    if (!(error instanceof Error)) {
        return { message: "[redacted]" }
    }
    try {
        const parsed = JSON.parse(error.message) as Record<string, unknown>
        const safeCopy = sanitizeParsedForLog(parsed) as Record<string, unknown>
        return { name: error.name, message: JSON.stringify(safeCopy) }
    } catch {
        return {
            name: error.name,
            message: sanitizeErrorText(error.message, 800),
        }
    }
}

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
