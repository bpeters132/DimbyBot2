"use server"

import type { StatusPayload } from "@/types/web"
import { getServiceStatusPayload } from "@/server/service-status"

function sanitizeErrorForLog(error: unknown): { name?: string; message: string } {
    if (!(error instanceof Error)) {
        return { message: String(error) }
    }
    const sensitive = /password|secret|token|uri|connectionString|connection|host|headers/i
    let message = error.message.replace(sensitive, "[redacted]")
    try {
        const parsed = JSON.parse(message) as Record<string, unknown>
        const copy = { ...parsed }
        for (const k of Object.keys(copy)) {
            if (sensitive.test(k)) {
                copy[k] = "[redacted]"
            }
        }
        message = JSON.stringify(copy)
    } catch {
        /* keep message string */
    }
    return { name: error.name, message }
}

/** Probes database connectivity and bot `/health` for the status UI. */
export async function getServiceStatusAction(): Promise<StatusPayload> {
    try {
        return await getServiceStatusPayload()
    } catch (error: unknown) {
        const safe = sanitizeErrorForLog(error)
        console.error("[status.actions] service status probe failed", safe)
        return {
            ok: false,
            checkedAt: new Date().toISOString(),
            database: { ok: false, message: "Status probe failed" },
            botApi: { ok: false, message: "Status probe failed" },
        }
    }
}
