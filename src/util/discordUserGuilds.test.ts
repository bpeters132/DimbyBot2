import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    GUILD_LIST_MAX_RETRY_WAIT_MS,
    discordRetryAfterMs,
    guildListExponentialBackoffMs,
    isDiscordUserGuildRow,
    parseDiscordUserGuildsPayload,
} from "./discordUserGuilds.js"

describe("isDiscordUserGuildRow", () => {
    it("accepts id/name with string or null icon", () => {
        assert.equal(isDiscordUserGuildRow({ id: "1", name: "A", icon: null }), true)
        assert.equal(isDiscordUserGuildRow({ id: "1", name: "A", icon: "abc" }), true)
    })

    it("rejects missing fields, wrong types, and non-objects", () => {
        assert.equal(isDiscordUserGuildRow(null), false)
        assert.equal(isDiscordUserGuildRow("guild"), false)
        assert.equal(isDiscordUserGuildRow({ id: 1, name: "A", icon: null }), false)
        assert.equal(isDiscordUserGuildRow({ id: "1", name: 2, icon: null }), false)
        assert.equal(isDiscordUserGuildRow({ id: "1", name: "A", icon: 3 }), false)
        assert.equal(isDiscordUserGuildRow({ name: "A", icon: null }), false)
        // icon must be present as string|null (undefined omitted keys fail closed)
        assert.equal(isDiscordUserGuildRow({ id: "1", name: "A" }), false)
    })
})

describe("parseDiscordUserGuildsPayload", () => {
    it("maps a valid array", () => {
        const parsed = parseDiscordUserGuildsPayload([
            { id: "10", name: "Alpha", icon: null },
            { id: "11", name: "Beta", icon: "hash" },
        ])
        assert.deepEqual(parsed, {
            ok: true,
            guilds: [
                { id: "10", name: "Alpha", icon: null },
                { id: "11", name: "Beta", icon: "hash" },
            ],
        })
    })

    it("rejects non-arrays and any malformed element (fail closed)", () => {
        assert.deepEqual(parseDiscordUserGuildsPayload({ id: "1", name: "A", icon: null }), {
            ok: false,
        })
        assert.deepEqual(
            parseDiscordUserGuildsPayload([
                { id: "1", name: "A", icon: null },
                { id: "2", name: "B" },
            ]),
            { ok: false }
        )
        assert.deepEqual(parseDiscordUserGuildsPayload([null]), { ok: false })
    })
})

describe("guildListExponentialBackoffMs", () => {
    it("doubles from 500ms and caps at the max retry wait", () => {
        assert.equal(guildListExponentialBackoffMs(1), 500)
        assert.equal(guildListExponentialBackoffMs(2), 1000)
        assert.equal(guildListExponentialBackoffMs(3), 2000)
        assert.equal(guildListExponentialBackoffMs(7), 32_000)
        assert.equal(guildListExponentialBackoffMs(8), GUILD_LIST_MAX_RETRY_WAIT_MS)
        assert.equal(guildListExponentialBackoffMs(20), GUILD_LIST_MAX_RETRY_WAIT_MS)
        assert.equal(guildListExponentialBackoffMs(0), 500)
        assert.equal(guildListExponentialBackoffMs(-5), 500)
    })
})

describe("discordRetryAfterMs", () => {
    function headers(map: Record<string, string | null>) {
        return {
            get(name: string) {
                const key = name.toLowerCase()
                return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null
            },
        }
    }

    it("prefers Retry-After header seconds and caps at max wait", () => {
        assert.equal(discordRetryAfterMs({ headers: headers({ "retry-after": "1.2" }) }, ""), 1200)
        assert.equal(
            discordRetryAfterMs({ headers: headers({ "retry-after": "999" }) }, ""),
            GUILD_LIST_MAX_RETRY_WAIT_MS
        )
        assert.equal(discordRetryAfterMs({ headers: headers({ "retry-after": "0" }) }, ""), 0)
    })

    it("falls back to JSON retry_after when the header is missing or invalid", () => {
        assert.equal(
            discordRetryAfterMs({ headers: headers({}) }, JSON.stringify({ retry_after: 2.4 })),
            2400
        )
        assert.equal(
            discordRetryAfterMs(
                { headers: headers({ "retry-after": "nope" }) },
                JSON.stringify({ retry_after: 3 })
            ),
            3000
        )
    })

    it("defaults to 2s when neither header nor body provides a delay", () => {
        assert.equal(discordRetryAfterMs({ headers: headers({}) }, "not-json"), 2000)
        assert.equal(discordRetryAfterMs({ headers: headers({}) }, "{}"), 2000)
        assert.equal(
            discordRetryAfterMs(
                { headers: headers({}) },
                JSON.stringify({ retry_after: "soon" })
            ),
            2000
        )
    })
})
