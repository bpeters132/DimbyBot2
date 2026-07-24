import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { snapshotFromRequester } from "./dashboardRequesterSnapshot.js"

describe("snapshotFromRequester", () => {
    it("returns null for missing or unusable requesters", () => {
        assert.equal(snapshotFromRequester(null), null)
        assert.equal(snapshotFromRequester(undefined), null)
        assert.equal(snapshotFromRequester({}), null)
        assert.equal(snapshotFromRequester({ username: "no-id" }), null)
        assert.equal(snapshotFromRequester(42), null)
    })

    it("accepts stamped string ids and numeric/bigint object ids", () => {
        assert.deepEqual(snapshotFromRequester("123456789012345678"), {
            id: "123456789012345678",
        })
        assert.deepEqual(snapshotFromRequester({ id: 42 }), { id: "42" })
        assert.deepEqual(snapshotFromRequester({ id: 99n }), { id: "99" })
    })

    it("prefers globalName, then username, then displayName (trimmed)", () => {
        assert.deepEqual(
            snapshotFromRequester({
                id: "1",
                globalName: "  Display  ",
                username: "login",
                displayName: "nick",
            }),
            { id: "1", username: "Display" }
        )
        assert.deepEqual(
            snapshotFromRequester({ id: "2", globalName: "   ", username: " login ", displayName: "nick" }),
            { id: "2", username: "login" }
        )
        assert.deepEqual(
            snapshotFromRequester({ id: "3", username: "", displayName: "  Nick  " }),
            { id: "3", username: "Nick" }
        )
        assert.deepEqual(
            snapshotFromRequester({ id: "4", globalName: "", username: "  ", displayName: "  " }),
            { id: "4" }
        )
    })
})
