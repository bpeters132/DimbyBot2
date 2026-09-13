import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { clampQueueReorderInsertIndex } from "./queueReorderInsert.js"

describe("clampQueueReorderInsertIndex", () => {
    it("keeps an in-range destination unchanged", () => {
        assert.equal(clampQueueReorderInsertIndex(1, 3), 1)
        assert.equal(clampQueueReorderInsertIndex(0, 2), 0)
    })

    it("allows insert at the end (index === lenAfterRemove)", () => {
        // Moving the first track to the former last slot: after remove, dest may equal length.
        assert.equal(clampQueueReorderInsertIndex(2, 2), 2)
        assert.equal(clampQueueReorderInsertIndex(0, 0), 0)
    })

    it("clamps above the post-remove length (avoids out-of-range insert)", () => {
        assert.equal(clampQueueReorderInsertIndex(5, 2), 2)
        assert.equal(clampQueueReorderInsertIndex(99, 0), 0)
    })

    it("clamps negative destinations to 0", () => {
        assert.equal(clampQueueReorderInsertIndex(-1, 4), 0)
        assert.equal(clampQueueReorderInsertIndex(-10, 0), 0)
    })
})
