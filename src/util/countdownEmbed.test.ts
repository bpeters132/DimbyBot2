import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { CountdownEntry } from "../types/index.js"
import {
    DEFAULT_COUNTDOWN_COLOR,
    buildCountdownEmbed,
    buildCountdownFinishEmbed,
} from "./countdownEmbed.js"

function entry(overrides: Partial<CountdownEntry> = {}): CountdownEntry {
    return {
        id: 7,
        guildId: "g1",
        channelId: "c1",
        messageId: "m1",
        eventName: "Launch Party",
        description: null,
        imageUrl: null,
        color: null,
        footer: null,
        finishMessage: null,
        mentionRoleId: null,
        targetTime: new Date("2030-01-01T00:00:00.000Z"),
        createdBy: "u1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    }
}

describe("buildCountdownEmbed", () => {
    it("shows remaining time, default color/footer, and optional description/image", () => {
        const target = new Date("2030-01-01T00:00:00.000Z")
        const now = target.getTime() - 90 * 60 * 1000
        const embed = buildCountdownEmbed(
            entry({
                description: "Bring snacks",
                imageUrl: "https://cdn.example.com/party.png",
                targetTime: target,
            }),
            now
        )
        const data = embed.toJSON()
        assert.equal(data.title, "Launch Party")
        assert.equal(data.color, DEFAULT_COUNTDOWN_COLOR)
        assert.equal(data.footer?.text, "Countdown #7")
        assert.equal(data.image?.url, "https://cdn.example.com/party.png")
        assert.match(String(data.description), /Bring snacks/)
        assert.match(String(data.description), /\*\*Starts:\*\* <t:1893456000:F>/)
        assert.match(String(data.description), /\*\*Time remaining:\*\* 1 hour, 30 minutes/)
    })

    it("marks the event as started and honors custom color/footer", () => {
        const target = new Date("2030-01-01T00:00:00.000Z")
        const embed = buildCountdownEmbed(
            entry({
                color: 0xff0000,
                footer: "Custom footer",
                targetTime: target,
            }),
            target.getTime() + 1
        )
        const data = embed.toJSON()
        assert.equal(data.color, 0xff0000)
        assert.equal(data.footer?.text, "Custom footer")
        assert.match(String(data.description), /\*\*Time remaining:\*\* Event started!/)
        assert.equal(data.image, undefined)
    })
})

describe("buildCountdownFinishEmbed", () => {
    it("returns null when there is no image to re-post", () => {
        assert.equal(buildCountdownFinishEmbed(entry({ imageUrl: null })), null)
    })

    it("builds a title+image finish embed with default or custom color", () => {
        const withDefault = buildCountdownFinishEmbed(
            entry({ imageUrl: "https://cdn.example.com/done.png" })
        )
        assert.ok(withDefault)
        const defaultData = withDefault.toJSON()
        assert.equal(defaultData.title, "Launch Party")
        assert.equal(defaultData.color, DEFAULT_COUNTDOWN_COLOR)
        assert.equal(defaultData.image?.url, "https://cdn.example.com/done.png")

        const withColor = buildCountdownFinishEmbed(
            entry({ imageUrl: "https://cdn.example.com/done.png", color: 0x00ff00 })
        )
        assert.ok(withColor)
        assert.equal(withColor.toJSON().color, 0x00ff00)
    })
})
