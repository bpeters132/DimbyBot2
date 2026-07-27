import assert from "node:assert/strict"
import type { IncomingMessage } from "http"
import { describe, it } from "node:test"
import { incomingMessageToHeaders } from "./httpUtil.js"

function fakeReq(headers: IncomingMessage["headers"]): IncomingMessage {
    return { headers } as IncomingMessage
}

describe("incomingMessageToHeaders", () => {
    it("copies string header values with set()", () => {
        const headers = incomingMessageToHeaders(
            fakeReq({
                cookie: "session=abc",
                "content-type": "application/json",
            })
        )
        assert.equal(headers.get("cookie"), "session=abc")
        assert.equal(headers.get("content-type"), "application/json")
    })

    it("appends each value when Node supplies a string array", () => {
        const headers = incomingMessageToHeaders(
            fakeReq({
                "set-cookie": ["a=1", "b=2"],
                "x-forwarded-for": ["1.1.1.1", "2.2.2.2"],
            })
        )
        assert.deepEqual(headers.getSetCookie(), ["a=1", "b=2"])
        assert.equal(headers.get("x-forwarded-for"), "1.1.1.1, 2.2.2.2")
    })

    it("skips undefined header values without throwing", () => {
        const headers = incomingMessageToHeaders(
            fakeReq({
                authorization: "Bearer tok",
                "x-missing": undefined,
            })
        )
        assert.equal(headers.get("authorization"), "Bearer tok")
        assert.equal(headers.has("x-missing"), false)
    })
})
