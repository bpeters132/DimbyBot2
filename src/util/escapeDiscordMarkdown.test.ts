import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { escapeDiscordMarkdown } from "./escapeDiscordMarkdown.js"

describe("escapeDiscordMarkdown", () => {
    it("escapes backslash, asterisk, underscore, and backtick", () => {
        assert.equal(escapeDiscordMarkdown("a\\b*c_d`e"), "a\\\\b\\*c\\_d\\`e")
    })

    it("leaves plain names unchanged", () => {
        assert.equal(escapeDiscordMarkdown("Brandt"), "Brandt")
        assert.equal(escapeDiscordMarkdown("user-123"), "user-123")
    })

    it("prevents spoofed bold/italic/code in display names", () => {
        assert.equal(escapeDiscordMarkdown("*admin*"), "\\*admin\\*")
        assert.equal(escapeDiscordMarkdown("_mod_"), "\\_mod\\_")
        assert.equal(escapeDiscordMarkdown("`token`"), "\\`token\\`")
    })

    it("escapes backslashes before other metacharacters so unescaping cannot revive markup", () => {
        // Without first escaping `\`, `\*` would become `\\*` then lose the backslash pairing.
        assert.equal(escapeDiscordMarkdown("\\*already"), "\\\\\\*already")
    })
})
