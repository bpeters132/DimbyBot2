import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { GuildDiscordLogSettings } from "../types/index.js"
import { discordLogLevelAllowed, resolveDiscordLogChannelId } from "./discordLogForward.js"

describe("resolveDiscordLogChannelId", () => {
    it("prefers per-level overrides over allChannelId", () => {
        const cfg: GuildDiscordLogSettings = {
            allChannelId: "all-chan",
            byLevel: { error: "error-chan", warn: "warn-chan" },
        }
        assert.equal(resolveDiscordLogChannelId(cfg, "error"), "error-chan")
        assert.equal(resolveDiscordLogChannelId(cfg, "warn"), "warn-chan")
        assert.equal(resolveDiscordLogChannelId(cfg, "info"), "all-chan")
        assert.equal(resolveDiscordLogChannelId(cfg, "debug"), "all-chan")
    })

    it("returns null when neither per-level nor allChannelId is set", () => {
        assert.equal(resolveDiscordLogChannelId({}, "error"), null)
        assert.equal(resolveDiscordLogChannelId({ byLevel: {} }, "info"), null)
    })
})

describe("discordLogLevelAllowed", () => {
    it("defaults minLevel to debug (all levels allowed)", () => {
        const cfg: GuildDiscordLogSettings = {}
        assert.equal(discordLogLevelAllowed(cfg, "debug"), true)
        assert.equal(discordLogLevelAllowed(cfg, "error"), true)
    })

    it("filters below the configured threshold and allows equal/higher", () => {
        const cfg: GuildDiscordLogSettings = { minLevel: "warn" }
        assert.equal(discordLogLevelAllowed(cfg, "debug"), false)
        assert.equal(discordLogLevelAllowed(cfg, "info"), false)
        assert.equal(discordLogLevelAllowed(cfg, "warn"), true)
        assert.equal(discordLogLevelAllowed(cfg, "error"), true)
    })

    it("allows only error when minLevel is error", () => {
        const cfg: GuildDiscordLogSettings = { minLevel: "error" }
        assert.equal(discordLogLevelAllowed(cfg, "warn"), false)
        assert.equal(discordLogLevelAllowed(cfg, "error"), true)
    })
})
