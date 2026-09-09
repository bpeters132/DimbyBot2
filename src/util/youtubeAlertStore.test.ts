import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import type { YoutubeAlertEntry, YoutubeAlertInput, YoutubeWatchEntry } from "../types/index.js"
import {
    addYoutubeAlert,
    getYoutubeAlert,
    getYoutubeAlertsForGuild,
    getYoutubeAlertsForWatch,
    getYoutubeWatch,
    initializeYoutubeAlertStore,
    isYoutubeAlertStoreInitialized,
    isYoutubeVideoSeen,
    markYoutubeVideosSeen,
    removeYoutubeAlert,
    resetYoutubeAlertStoreForTests,
    setYoutubeAlertStoreDbForTests,
} from "./youtubeAlertStore.js"

const CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw"

function watch(overrides: Partial<YoutubeWatchEntry> = {}): YoutubeWatchEntry {
    return {
        id: 1,
        guildId: "100",
        youtubeChannelId: CHANNEL_ID,
        youtubeChannelName: "LTT",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    }
}

function alert(overrides: Partial<YoutubeAlertEntry> = {}): YoutubeAlertEntry {
    return {
        id: 1,
        watchId: 1,
        discordChannelId: "200",
        mentionRoleIds: [],
        messageTemplate: null,
        eventTypes: ["video"],
        createdBy: "300",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    }
}

function input(overrides: Partial<YoutubeAlertInput> = {}): YoutubeAlertInput {
    return {
        guildId: "100",
        youtubeChannelId: CHANNEL_ID,
        youtubeChannelName: "LTT",
        discordChannelId: "200",
        mentionRoleIds: [],
        messageTemplate: null,
        eventTypes: ["video"],
        createdBy: "300",
        ...overrides,
    }
}

afterEach(() => {
    resetYoutubeAlertStoreForTests()
    setYoutubeAlertStoreDbForTests(null)
})

describe("youtubeAlertStore init guard", () => {
    it("throws before initialize", () => {
        assert.equal(isYoutubeAlertStoreInitialized(), false)
        assert.throws(() => getYoutubeWatch(1), /before initialization/)
    })
})

describe("youtubeAlertStore alerts and watches", () => {
    it("attaches a second Alert to the same Watch and removes the Watch with the last Alert", async () => {
        let nextWatchId = 1
        let nextAlertId = 1
        const watches = new Map<number, YoutubeWatchEntry>()
        const alerts = new Map<number, YoutubeAlertEntry>()

        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [],
                alerts: [],
                seenByWatch: {},
                leases: [],
            }),
            createYoutubeAlertWithWatch: async (row) => {
                const existing = [...watches.values()].find(
                    (w) => w.guildId === row.guildId && w.youtubeChannelId === row.youtubeChannelId
                )
                const createdWatch = !existing
                const w =
                    existing ??
                    watch({ id: nextWatchId++, youtubeChannelName: row.youtubeChannelName })
                watches.set(w.id, w)
                const a = alert({
                    id: nextAlertId++,
                    watchId: w.id,
                    discordChannelId: row.discordChannelId,
                    eventTypes: row.eventTypes,
                })
                alerts.set(a.id, a)
                return { watch: w, alert: a, createdWatch }
            },
            deleteYoutubeAlert: async (id) => {
                const a = alerts.get(id)
                if (!a) return null
                alerts.delete(id)
                const remaining = [...alerts.values()].filter((row) => row.watchId === a.watchId)
                let removedWatch: YoutubeWatchEntry | null = null
                if (remaining.length === 0) {
                    removedWatch = watches.get(a.watchId) ?? null
                    watches.delete(a.watchId)
                }
                return { alert: a, removedWatch }
            },
            addYoutubeSeenVideos: async () => {},
        })

        await initializeYoutubeAlertStore({ info() {}, error() {} })
        const first = await addYoutubeAlert(input({ eventTypes: ["video"] }))
        assert.equal(first.createdWatch, true)
        const second = await addYoutubeAlert(
            input({ eventTypes: ["short"], discordChannelId: "201" })
        )
        assert.equal(second.createdWatch, false)
        assert.equal(second.watch.id, first.watch.id)
        assert.equal(getYoutubeAlertsForWatch(first.watch.id).length, 2)
        assert.equal(getYoutubeAlertsForGuild("100").length, 2)

        const firstRemove = await removeYoutubeAlert(first.alert.id)
        assert.equal(firstRemove?.removedWatch, null)
        assert.ok(getYoutubeWatch(first.watch.id))

        const lastRemove = await removeYoutubeAlert(second.alert.id)
        assert.ok(lastRemove?.removedWatch)
        assert.equal(getYoutubeWatch(first.watch.id), undefined)
        assert.equal(getYoutubeAlert(second.alert.id), undefined)
    })

    it("records seen ids so backlog and edits do not re-fire", async () => {
        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [watch()],
                alerts: [alert()],
                seenByWatch: { 1: ["already"] },
                leases: [],
            }),
            addYoutubeSeenVideos: async () => {},
        })
        await initializeYoutubeAlertStore({ info() {}, error() {} })
        assert.equal(isYoutubeVideoSeen(1, "already"), true)
        assert.equal(isYoutubeVideoSeen(1, "new"), false)
        await markYoutubeVideosSeen(1, ["new", "new"])
        assert.equal(isYoutubeVideoSeen(1, "new"), true)
    })
})
