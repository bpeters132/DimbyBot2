import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolveWebRequesterDiscordId } from "./resolveWebRequesterId.js"

const SESSION_ID = "123456789012345678"

describe("resolveWebRequesterDiscordId", () => {
    it("defaults to the authenticated Discord snowflake when body omits requester id", () => {
        assert.deepEqual(resolveWebRequesterDiscordId({}, SESSION_ID), {
            ok: true,
            requesterId: SESSION_ID,
        })
        assert.deepEqual(resolveWebRequesterDiscordId(null, SESSION_ID), {
            ok: true,
            requesterId: SESSION_ID,
        })
        assert.deepEqual(resolveWebRequesterDiscordId("not-an-object", SESSION_ID), {
            ok: true,
            requesterId: SESSION_ID,
        })
    })

    it("accepts a matching requesterDiscordUserId (trimmed)", () => {
        assert.deepEqual(
            resolveWebRequesterDiscordId(
                { requesterDiscordUserId: `  ${SESSION_ID}  ` },
                SESSION_ID
            ),
            { ok: true, requesterId: SESSION_ID }
        )
    })

    it("rejects empty or non-string requesterDiscordUserId when provided", () => {
        assert.deepEqual(
            resolveWebRequesterDiscordId({ requesterDiscordUserId: "" }, SESSION_ID),
            {
                ok: false,
                status: 400,
                error: "Invalid requesterDiscordUserId.",
                details: "Must be a non-empty string when provided.",
            }
        )
        assert.deepEqual(
            resolveWebRequesterDiscordId({ requesterDiscordUserId: "   " }, SESSION_ID),
            {
                ok: false,
                status: 400,
                error: "Invalid requesterDiscordUserId.",
                details: "Must be a non-empty string when provided.",
            }
        )
        assert.deepEqual(
            resolveWebRequesterDiscordId({ requesterDiscordUserId: 42 }, SESSION_ID),
            {
                ok: false,
                status: 400,
                error: "Invalid requesterDiscordUserId.",
                details: "Must be a non-empty string when provided.",
            }
        )
    })

    it("rejects a requesterDiscordUserId that does not match the signed-in account", () => {
        assert.deepEqual(
            resolveWebRequesterDiscordId(
                { requesterDiscordUserId: "999999999999999999" },
                SESSION_ID
            ),
            {
                ok: false,
                status: 403,
                error: "Forbidden",
                details: "requesterDiscordUserId does not match the signed-in account.",
            }
        )
    })
})
