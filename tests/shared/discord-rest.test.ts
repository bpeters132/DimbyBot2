import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { fetchDiscordCurrentUserId, parseDiscordUsersMeId } from "../../src/shared/discord-rest.js"

const SNOWFLAKE = "123456789012345678"

describe("parseDiscordUsersMeId", () => {
    it("accepts a trimmed string snowflake from GET /users/@me JSON", () => {
        assert.equal(parseDiscordUsersMeId({ id: SNOWFLAKE }), SNOWFLAKE)
        assert.equal(parseDiscordUsersMeId({ id: `  ${SNOWFLAKE}  ` }), SNOWFLAKE)
    })

    it("rejects numeric ids so snowflakes above MAX_SAFE_INTEGER cannot be rounded", () => {
        // 18-digit snowflakes cannot be JSON numbers; Number(SNOWFLAKE) is already rounded.
        assert.equal(parseDiscordUsersMeId({ id: Number(SNOWFLAKE) }), null)
        assert.equal(parseDiscordUsersMeId({ id: 123456789012345678n }), null)
    })

    it("rejects non-objects, missing ids, and non-snowflake strings", () => {
        assert.equal(parseDiscordUsersMeId(null), null)
        assert.equal(parseDiscordUsersMeId(undefined), null)
        assert.equal(parseDiscordUsersMeId("not-json"), null)
        assert.equal(parseDiscordUsersMeId([]), null)
        assert.equal(parseDiscordUsersMeId({}), null)
        assert.equal(parseDiscordUsersMeId({ id: "" }), null)
        assert.equal(parseDiscordUsersMeId({ id: "   " }), null)
        assert.equal(parseDiscordUsersMeId({ id: "not-a-snowflake" }), null)
        assert.equal(parseDiscordUsersMeId({ id: "1234567890123456" }), null)
        assert.equal(parseDiscordUsersMeId({ user: { id: SNOWFLAKE } }), null)
    })
})

describe("fetchDiscordCurrentUserId", () => {
    const previousFetch = globalThis.fetch

    afterEach(() => {
        globalThis.fetch = previousFetch
    })

    it("returns the snowflake from a successful /users/@me response", async () => {
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ id: SNOWFLAKE }), {
                status: 200,
                headers: { "content-type": "application/json" },
            })) as typeof fetch
        assert.equal(await fetchDiscordCurrentUserId("token"), SNOWFLAKE)
    })

    it("fails closed on non-OK Discord responses", async () => {
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ id: SNOWFLAKE }), { status: 401 })) as typeof fetch
        assert.equal(await fetchDiscordCurrentUserId("token"), null)
    })

    it("fails closed when fetch throws or aborts", async () => {
        globalThis.fetch = (async () => {
            throw new Error("network down")
        }) as typeof fetch
        assert.equal(await fetchDiscordCurrentUserId("token"), null)
    })
})
