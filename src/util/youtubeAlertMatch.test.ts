import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { YoutubeAlertEntry } from "../types/index.js"
import { matchYoutubeAlerts } from "./youtubeAlertMatch.js"

function alert(overrides: Partial<YoutubeAlertEntry>): YoutubeAlertEntry {
    return {
        id: 1,
        watchId: 10,
        discordChannelId: "chan",
        mentionRoleIds: [],
        messageTemplate: null,
        eventTypes: ["video"],
        createdBy: "user",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    }
}

describe("matchYoutubeAlerts", () => {
    it("returns every Alert on a Watch that includes the event type, in id order", () => {
        const alerts = [
            alert({ id: 2, eventTypes: ["short"] }),
            alert({ id: 1, eventTypes: ["video", "short"] }),
            alert({ id: 3, eventTypes: ["video"] }),
        ]
        const matched = matchYoutubeAlerts(alerts, "video")
        assert.deepEqual(
            matched.map((row) => row.id),
            [1, 3]
        )
        assert.deepEqual(
            matchYoutubeAlerts(alerts, "short").map((row) => row.id),
            [1, 2]
        )
        assert.deepEqual(matchYoutubeAlerts(alerts, "live"), [])
    })
})
