import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    downloadMetadataMigrationShouldAbortStartup,
    shouldRenameDownloadMetadataJsonAfterWrite,
} from "./downloadMetadataMigrationOutcome.js"

describe("downloadMetadataMigrationOutcome", () => {
    it("does not abort startup for intentional UNKNOWN write skips", () => {
        assert.equal(
            downloadMetadataMigrationShouldAbortStartup({
                validationFailedCount: 0,
                writeSkippedCount: 3,
            }),
            false
        )
    })

    it("still aborts when validation rejected entries (strict mode)", () => {
        assert.equal(
            downloadMetadataMigrationShouldAbortStartup({
                validationFailedCount: 2,
                writeSkippedCount: 0,
            }),
            true
        )
    })

    it("renames JSON when every row was an unresolvable skip (0 written)", () => {
        assert.equal(
            shouldRenameDownloadMetadataJsonAfterWrite({
                rowsWritten: 0,
                skippedEntries: 2,
            }),
            true
        )
    })

    it("keeps JSON when some rows migrated and some were skipped", () => {
        assert.equal(
            shouldRenameDownloadMetadataJsonAfterWrite({
                rowsWritten: 5,
                skippedEntries: 1,
            }),
            false
        )
    })

    it("renames JSON when the write fully succeeded", () => {
        assert.equal(
            shouldRenameDownloadMetadataJsonAfterWrite({
                rowsWritten: 4,
                skippedEntries: 0,
            }),
            true
        )
    })
})
