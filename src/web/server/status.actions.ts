"use server"

import type { StatusPayload } from "@/types/web"
import { getServiceStatusPayload } from "@/server/service-status"

/** Probes database connectivity and bot `/health` for the status UI. */
export async function getServiceStatusAction(): Promise<StatusPayload> {
    return getServiceStatusPayload()
}
