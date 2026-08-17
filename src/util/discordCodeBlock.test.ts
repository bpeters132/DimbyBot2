import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { escapeFenceBreaks, toCodeBlock } from "./discordCodeBlock.js"

/** Escape inserts a ZWSP between every backtick in a run of length ≥ 3. */
function escapedRun(len: number): string {
    return Array.from({ length: len }, () => "`").join("\u200b")
}

describe("escapeFenceBreaks", () => {
    it("inserts a zero-width space so ``` cannot close an outer fence", () => {
        const out = escapeFenceBreaks("before ``` after")
        assert.equal(out.includes("```"), false)
        assert.equal(out, `before ${escapedRun(3)} after`)
    })

    it("escapes every triple-backtick run in the string", () => {
        const out = escapeFenceBreaks("```js\ncode\n```")
        assert.equal(out.includes("```"), false)
        assert.equal(out, `${escapedRun(3)}js\ncode\n${escapedRun(3)}`)
    })

    it("escapes runs of four or more backticks", () => {
        const four = escapeFenceBreaks("before ```` after")
        assert.equal(four.includes("```"), false)
        assert.equal(four, `before ${escapedRun(4)} after`)

        const six = escapeFenceBreaks("``````")
        assert.equal(six.includes("```"), false)
        assert.equal(six, escapedRun(6))
    })
})

describe("toCodeBlock", () => {
    it("wraps escaped content in a language fence", () => {
        const block = toCodeBlock("js", "const x = 1")
        assert.equal(block.startsWith("```js\n"), true)
        assert.equal(block.endsWith("\n```"), true)
        assert.match(block, /const x = 1/)
    })

    it("escapes fence breakouts inside the body", () => {
        const block = toCodeBlock("txt", "evil ``` breakout")
        assert.equal(block.includes("evil ```"), false)
        assert.match(
            block,
            new RegExp(`evil ${escapedRun(3).replace(/\u200b/g, "\\u200b")} breakout`)
        )
        assert.equal(block.includes(`evil ${escapedRun(3)} breakout`), true)
    })

    it("truncates to the Discord field budget with a marker", () => {
        const block = toCodeBlock("js", "x".repeat(2000), 80)
        assert.ok(block.length <= 80)
        assert.match(block, /\.\.\.\[truncated]/)
        assert.equal(block.startsWith("```js\n"), true)
        assert.equal(block.endsWith("\n```"), true)
    })
})
