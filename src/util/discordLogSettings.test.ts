import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { GuildSettingsStore } from "../types/index.js"
import {
    applyNormalizedDiscordLog,
    detachGuildRow,
    guildSettingsSaveOptions,
    normalizeDiscordLog,
    storeWithGuildRow,
} from "./discordLogSettings.js"

describe("normalizeDiscordLog", () => {
    it("strips empty byLevel entries and returns undefined when nothing remains", () => {
        assert.equal(
            normalizeDiscordLog({ byLevel: { error: "", info: undefined as never } }),
            undefined
        )
        assert.equal(normalizeDiscordLog({}), undefined)
    })

    it("keeps usable allChannelId / minLevel / non-empty byLevel", () => {
        assert.deepEqual(normalizeDiscordLog({ allChannelId: "c1", byLevel: { error: "" } }), {
            allChannelId: "c1",
        })
        assert.deepEqual(normalizeDiscordLog({ minLevel: "warn" }), { minLevel: "warn" })
        assert.deepEqual(normalizeDiscordLog({ byLevel: { error: "e1", warn: "" } }), {
            byLevel: { error: "e1" },
        })
    })
})

describe("applyNormalizedDiscordLog + storeWithGuildRow", () => {
    it("deletes discordLog when normalized config is empty", () => {
        const row = {
            controlChannelId: "ctrl",
            discordLog: { allChannelId: "old" },
        }
        applyNormalizedDiscordLog({ byLevel: { error: "" } }, row)
        assert.equal("discordLog" in row, false)
        assert.equal(row.controlChannelId, "ctrl")
    })

    it("drops the guild key when the working row becomes empty", () => {
        const before: GuildSettingsStore = {
            g1: { discordLog: { allChannelId: "c1" } },
            g2: { controlChannelId: "keep" },
        }
        const working = detachGuildRow(before.g1)
        applyNormalizedDiscordLog({}, working)
        const after = storeWithGuildRow(before, "g1", working)
        assert.equal("g1" in after, false)
        assert.deepEqual(after.g2, { controlChannelId: "keep" })
    })
})

describe("guildSettingsSaveOptions", () => {
    it("marks deleteGuildIds and clearedGuildFields when discordLog is unset", () => {
        const before: GuildSettingsStore = {
            g1: { discordLog: { allChannelId: "c1" } },
        }
        const working = {}
        const after = storeWithGuildRow(before, "g1", working)
        assert.deepEqual(guildSettingsSaveOptions("g1", before, after, working), {
            deleteGuildIds: ["g1"],
            touchedGuildIds: ["g1"],
            clearedGuildFields: { g1: ["discordLog"] },
        })
    })

    it("does not clear discordLog when the field remains on the working row", () => {
        const before: GuildSettingsStore = {
            g1: {
                controlChannelId: "ctrl",
                discordLog: { allChannelId: "c1" },
            },
        }
        const working = detachGuildRow(before.g1)
        applyNormalizedDiscordLog({ allChannelId: "c2" }, working)
        const after = storeWithGuildRow(before, "g1", working)
        assert.deepEqual(guildSettingsSaveOptions("g1", before, after, working), {
            deleteGuildIds: [],
            touchedGuildIds: ["g1"],
        })
        assert.equal(working.discordLog?.allChannelId, "c2")
    })
})
