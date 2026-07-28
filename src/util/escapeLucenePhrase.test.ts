import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { escapeLucenePhrase } from "./escapeLucenePhrase.js"

describe("escapeLucenePhrase", () => {
    it("trims and escapes backslashes and quotes for Lucene phrases", () => {
        assert.equal(escapeLucenePhrase('  AC/DC "Live"  '), 'AC/DC \\"Live\\"')
        assert.equal(escapeLucenePhrase("path\\name"), "path\\\\name")
        assert.equal(escapeLucenePhrase('both\\"ends'), 'both\\\\\\"ends')
    })

    it("returns an empty string for blank or missing input", () => {
        assert.equal(escapeLucenePhrase(""), "")
        assert.equal(escapeLucenePhrase("   "), "")
        assert.equal(escapeLucenePhrase(undefined as unknown as string), "")
    })
})
