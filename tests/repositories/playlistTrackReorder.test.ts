import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { reorderPlaylistTrackRows } from "../../src/repositories/playlistTrackReorder.js"

function rows(...positions: number[]) {
    return positions.map((position, i) => ({ id: i + 1, position }))
}

function idsOf(result: ReturnType<typeof reorderPlaylistTrackRows>) {
    assert.equal(result.ok, true)
    if (!result.ok) return []
    return result.rows.map((r) => r.id)
}

describe("reorderPlaylistTrackRows", () => {
    it("is a no-op when from and to are the same", () => {
        const input = rows(1, 2, 3)
        const result = reorderPlaylistTrackRows(input, 2, 2)
        assert.deepEqual(idsOf(result), [1, 2, 3])
        assert.notEqual(result.ok && result.rows, input)
    })

    it("moves first to last and last to first", () => {
        const input = rows(1, 2, 3, 4)
        assert.deepEqual(idsOf(reorderPlaylistTrackRows(input, 1, 4)), [2, 3, 4, 1])
        assert.deepEqual(idsOf(reorderPlaylistTrackRows(input, 4, 1)), [4, 1, 2, 3])
    })

    it("moves middle tracks forward and backward by 1-based destination index", () => {
        const input = rows(1, 2, 3, 4, 5)
        // from position 2 → slot 4: [1,3,4,2,5]
        assert.deepEqual(idsOf(reorderPlaylistTrackRows(input, 2, 4)), [1, 3, 4, 2, 5])
        // from position 4 → slot 2: [1,4,2,3,5]
        assert.deepEqual(idsOf(reorderPlaylistTrackRows(input, 4, 2)), [1, 4, 2, 3, 5])
    })

    it("looks up from by position value but inserts to as sorted-array index", () => {
        // Positions drifted: values are not dense 1..n. from uses value match;
        // to=2 means second slot in the sorted list, not position===2 (absent).
        const drifted = [
            { id: 10, position: 1 },
            { id: 20, position: 3 },
            { id: 30, position: 5 },
        ]
        assert.deepEqual(idsOf(reorderPlaylistTrackRows(drifted, 5, 2)), [10, 30, 20])
        assert.deepEqual(idsOf(reorderPlaylistTrackRows(drifted, 1, 3)), [20, 30, 10])
    })

    it("moves a gapped middle track to the end when position value equals destination slot", () => {
        // Concurrent deletes can leave gaps; append then yields e.g. 1,2,4,5.
        // Dashboard drag of position 4 → last slot sends from=4, to=4. Comparing
        // those values as a no-op would leave order unchanged (silent reorder miss).
        const gapped = [
            { id: 10, position: 1 },
            { id: 20, position: 2 },
            { id: 30, position: 4 },
            { id: 40, position: 5 },
        ]
        assert.deepEqual(idsOf(reorderPlaylistTrackRows(gapped, 4, 4)), [10, 20, 40, 30])
        // Same-slot no-op still holds: track at position 2 is already in slot 2.
        assert.deepEqual(idsOf(reorderPlaylistTrackRows(gapped, 2, 2)), [10, 20, 30, 40])
        // Gapped same-slot: position 4 is sorted index 2 (slot 3), not slot 4.
        assert.deepEqual(idsOf(reorderPlaylistTrackRows(gapped, 4, 3)), [10, 20, 30, 40])
    })

    it("rejects empty playlists and missing / out-of-range positions", () => {
        assert.deepEqual(reorderPlaylistTrackRows([], 1, 1), {
            ok: false,
            reason: "empty",
            missingPosition: 1,
        })
        assert.deepEqual(reorderPlaylistTrackRows(rows(1, 2, 3), 9, 1), {
            ok: false,
            reason: "from_not_found",
            missingPosition: 9,
        })
        assert.deepEqual(reorderPlaylistTrackRows(rows(1, 2, 3), 1, 0), {
            ok: false,
            reason: "to_out_of_range",
            missingPosition: 0,
        })
        assert.deepEqual(reorderPlaylistTrackRows(rows(1, 2, 3), 1, 4), {
            ok: false,
            reason: "to_out_of_range",
            missingPosition: 4,
        })
    })
})
