import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseGuildListBotPayload } from "@/lib/parse-guild-list-response"

const guildList = {
    guilds: [
        {
            id: "1",
            name: "Test Guild",
            iconUrl: null,
            memberCount: 4,
            player: null,
        },
    ],
}

describe("parseGuildListBotPayload", () => {
    it("returns guild list data on HTTP 200 with ok:true", () => {
        assert.deepEqual(
            parseGuildListBotPayload(true, JSON.stringify({ ok: true, data: guildList })),
            { ok: true, data: guildList }
        )
    })

    it("fails closed on empty, HTML, and non-boolean ok payloads", () => {
        assert.deepEqual(parseGuildListBotPayload(true, "   "), {
            ok: false,
            error: "Empty response from bot API (is the bot running on BOT_API_PORT?)",
        })
        assert.deepEqual(parseGuildListBotPayload(false, "<html>502 Bad Gateway</html>"), {
            ok: false,
            error: "Bot API returned invalid JSON (proxy error or HTML error page).",
        })
        assert.deepEqual(parseGuildListBotPayload(true, JSON.stringify({ guilds: [] })), {
            ok: false,
            error: "Bot API returned an unexpected response shape.",
        })
        assert.deepEqual(parseGuildListBotPayload(true, JSON.stringify({ ok: "yes" })), {
            ok: false,
            error: "Bot API returned an unexpected response shape.",
        })
    })

    it("joins ok:false error + details and does not treat HTTP errors as an empty list", () => {
        assert.deepEqual(
            parseGuildListBotPayload(
                false,
                JSON.stringify({
                    ok: false,
                    error: { error: "Forbidden", details: "Missing Discord access token." },
                })
            ),
            { ok: false, error: "Forbidden — Missing Discord access token." }
        )
        assert.deepEqual(
            parseGuildListBotPayload(false, JSON.stringify({ ok: true, data: guildList })),
            { ok: false, error: "Failed to load guilds." }
        )
    })

    it("rejects HTTP 200 success payloads that omit guild list data", () => {
        assert.deepEqual(parseGuildListBotPayload(true, JSON.stringify({ ok: true })), {
            ok: false,
            error: "Bot API returned success without guild list data.",
        })
        assert.deepEqual(parseGuildListBotPayload(true, JSON.stringify({ ok: true, data: null })), {
            ok: false,
            error: "Bot API returned success without guild list data.",
        })
    })
})
