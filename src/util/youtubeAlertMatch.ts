import type { UploadEventType, YoutubeAlertEntry } from "../types/index.js"

/** Alerts on a Watch whose event-type set includes `eventType`, in id order. */
export function matchYoutubeAlerts(
    alerts: YoutubeAlertEntry[],
    eventType: UploadEventType
): YoutubeAlertEntry[] {
    return alerts
        .filter((alert) => alert.eventTypes.includes(eventType))
        .sort((a, b) => a.id - b.id)
}
