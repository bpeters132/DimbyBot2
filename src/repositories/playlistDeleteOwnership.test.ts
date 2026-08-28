import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ownedPlaylistDeleteWhere } from "./playlistRepository.js"

describe("ownedPlaylistDeleteWhere", () => {
    it("scopes delete to both playlist id and owner userId", () => {
        assert.deepEqual(ownedPlaylistDeleteWhere("user-a", 42), {
            id: 42,
            userId: "user-a",
        })
    })

    it("does not key delete by playlist name (avoids successor same-name wipe)", () => {
        const where = ownedPlaylistDeleteWhere("user-a", 5)
        assert.equal("name" in where, false)
        assert.equal(where.id, 5)
        // A newer playlist that reused the name would have a different id — untouched.
        assert.notEqual(where.id, 99)
    })
})
