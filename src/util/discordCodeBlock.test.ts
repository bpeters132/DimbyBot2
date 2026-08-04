import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { escapeFenceBreaks, toCodeBlock } from "./discordCodeBlock.js"

describe("escapeFenceBreaks", () => {
    it("inserts a zero-width space so ``` cannot close an outer fence", () => {
        const out = escapeFenceBreaks("before ``` after")
        assert.equal(out.includes("```"), false)
        assert.equal(out.includes("`\u200b``"), true)
        assert.match(out, /before `\u200b`` after/)
    })

    it("escapes every triple-backtick run in the string", () => {
        const out = escapeFenceBreaks("```js\ncode\n```")
        assert.equal((out.match(/`\u200b``/g) ?? []).length, 2)
        assert.equal(out.includes("```"), false)
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
        assert.match(block, /evil `\u200b`` breakout/)
    })

    it("truncates to the Discord field budget with a marker", () => {
        const block = toCodeBlock("js", "x".repeat(2000), 80)
        assert.ok(block.length <= 80)
        assert.match(block, /\.\.\.\[truncated]/)
        assert.equal(block.startsWith("```js\n"), true)
        assert.equal(block.endsWith("\n```"), true)
    })
})
