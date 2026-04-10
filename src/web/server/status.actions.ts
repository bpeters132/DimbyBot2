"use server"

import type { StatusPayload } from "@/types/web"
import { getServiceStatusPayload } from "@/server/service-status"

/** Probes database connectivity and bot `/health` for the status UI. */
export async function getServiceStatusAction(): Promise<StatusPayload> {
    try {
        return await getServiceStatusPayload()
    } catch (error) {
        console.error("[status.actions] service status probe failed", error)
        return {
            checkedAt: new Date().toISOString(),
            database: { ok: false, message: "Status probe failed" },
            botApi: { ok: false, message: "Status probe failed" },
        }
    }
}
