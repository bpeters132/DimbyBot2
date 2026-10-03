import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    isLocalPlayCancelledByEpoch,
    nextLocalPlayCancelEpoch,
    readLocalPlayCancelEpoch,
} from "./localPlayCancelEpoch.js"

describe("readLocalPlayCancelEpoch", () => {
    it("treats missing storage as epoch 0", () => {
        assert.equal(readLocalPlayCancelEpoch(undefined), 0)
        assert.equal(readLocalPlayCancelEpoch(0), 0)
        assert.equal(readLocalPlayCancelEpoch(3), 3)
    })
})

describe("nextLocalPlayCancelEpoch", () => {
    it("bumps from 0 when nothing has cancelled yet", () => {
        assert.equal(nextLocalPlayCancelEpoch(undefined), 1)
        assert.equal(nextLocalPlayCancelEpoch(0), 1)
    })

    it("increments an existing epoch so a later cancel invalidates an in-flight play", () => {
        assert.equal(nextLocalPlayCancelEpoch(1), 2)
        assert.equal(nextLocalPlayCancelEpoch(7), 8)
    })
})

describe("isLocalPlayCancelledByEpoch", () => {
    it("is false when the stored epoch still matches the play start", () => {
        assert.equal(isLocalPlayCancelledByEpoch(undefined, 0), false)
        assert.equal(isLocalPlayCancelledByEpoch(0, 0), false)
        assert.equal(isLocalPlayCancelledByEpoch(2, 2), false)
    })

    it("is true after /stop or /leave bumps the epoch past this play", () => {
        assert.equal(isLocalPlayCancelledByEpoch(1, 0), true)
        assert.equal(isLocalPlayCancelledByEpoch(3, 2), true)
        assert.equal(isLocalPlayCancelledByEpoch(undefined, 1), true)
    })
})
