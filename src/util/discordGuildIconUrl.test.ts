import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { discordGuildIconUrl } from "./discordGuildIconUrl.js"

describe("discordGuildIconUrl", () => {
    it("builds a CDN PNG URL for a non-empty icon hash", () => {
        assert.equal(
            discordGuildIconUrl("123456789012345678", "abcdef0123456789"),
            "https://cdn.discordapp.com/icons/123456789012345678/abcdef0123456789.png?size=128"
        )
    })

    it("returns null for missing icon hashes", () => {
        assert.equal(discordGuildIconUrl("123", null), null)
        assert.equal(discordGuildIconUrl("123", undefined), null)
        assert.equal(discordGuildIconUrl("123", ""), null)
    })
})
