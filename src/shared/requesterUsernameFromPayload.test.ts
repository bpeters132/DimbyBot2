import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { snapshotFromRequester } from "../util/dashboardRequesterSnapshot.js"
import { requesterUsernameFromPayload } from "./player-state.js"

describe("requesterUsernameFromPayload", () => {
    it("returns null for non-objects and blank name fields", () => {
        assert.equal(requesterUsernameFromPayload(null), null)
        assert.equal(requesterUsernameFromPayload(undefined), null)
        assert.equal(requesterUsernameFromPayload("alice"), null)
        assert.equal(requesterUsernameFromPayload(42), null)
        assert.equal(requesterUsernameFromPayload({}), null)
        assert.equal(
            requesterUsernameFromPayload({
                displayName: "  ",
                globalName: "",
                username: "   ",
                tag: "\t",
            }),
            null
        )
    })

    it("prefers displayName, then globalName, username, then tag (trimmed)", () => {
        assert.equal(
            requesterUsernameFromPayload({
                displayName: "  Nick  ",
                globalName: "Global",
                username: "login",
                tag: "login#0001",
            }),
            "Nick"
        )
        assert.equal(
            requesterUsernameFromPayload({
                displayName: "   ",
                globalName: "  Global  ",
                username: "login",
                tag: "login#0001",
            }),
            "Global"
        )
        assert.equal(
            requesterUsernameFromPayload({
                globalName: "",
                username: " login ",
                tag: "login#0001",
            }),
            "login"
        )
        assert.equal(requesterUsernameFromPayload({ tag: "  login#0001  " }), "login#0001")
    })

    it("differs from snapshotFromRequester when displayName and globalName both exist", () => {
        const requester = {
            id: "123456789012345678",
            displayName: "GuildNick",
            globalName: "GlobalName",
            username: "login",
        }
        // Queue/player embeds prefer guild nick; session stamps prefer Discord global name.
        assert.equal(requesterUsernameFromPayload(requester), "GuildNick")
        assert.deepEqual(snapshotFromRequester(requester), {
            id: "123456789012345678",
            username: "GlobalName",
        })
    })
})
