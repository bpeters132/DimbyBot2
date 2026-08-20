import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isBlockedUserMediaUrl, isHttpUrlQuery } from "./userMediaUrl.js"

describe("isHttpUrlQuery", () => {
    it("detects http(s) prefixes", () => {
        assert.equal(isHttpUrlQuery("https://youtube.com/watch?v=dQw4w9WgXcQ"), true)
        assert.equal(isHttpUrlQuery("  http://open.spotify.com/track/abc  "), true)
        assert.equal(isHttpUrlQuery("HTTP://127.0.0.1/"), true)
        assert.equal(isHttpUrlQuery("never gonna give you up"), false)
        assert.equal(isHttpUrlQuery("ytsearch:rick astley"), false)
    })
})

describe("isBlockedUserMediaUrl", () => {
    it("allows public catalog hosts", () => {
        assert.equal(isBlockedUserMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), false)
        assert.equal(isBlockedUserMediaUrl("https://youtu.be/dQw4w9WgXcQ"), false)
        assert.equal(isBlockedUserMediaUrl("https://open.spotify.com/track/abc"), false)
        assert.equal(isBlockedUserMediaUrl("https://soundcloud.com/artist/track"), false)
        assert.equal(isBlockedUserMediaUrl("never gonna give you up"), false)
    })

    it("rejects loopback, RFC1918, and link-local addresses", () => {
        assert.equal(isBlockedUserMediaUrl("http://127.0.0.1:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://127.0.0.1/"), true)
        assert.equal(isBlockedUserMediaUrl(" http://127.0.0.1:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost:3001/ws"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost./"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.localhost./"), true)
        assert.equal(isBlockedUserMediaUrl("http://10.0.0.5/"), true)
        assert.equal(isBlockedUserMediaUrl("http://192.168.1.10/audio.mp3"), true)
        assert.equal(isBlockedUserMediaUrl("http://172.16.0.2/"), true)
        assert.equal(isBlockedUserMediaUrl("http://169.254.1.1/"), true)
        assert.equal(isBlockedUserMediaUrl("http://[::1]/"), true)
        assert.equal(isBlockedUserMediaUrl("http://[::ffff:127.0.0.1]/"), true)
        assert.equal(isBlockedUserMediaUrl("http://[fd12:3456:789a:1::1]/"), true)
        assert.equal(isBlockedUserMediaUrl("http://[fe90::1]/"), true)
    })

    it("rejects Docker-internal single-label hosts", () => {
        assert.equal(isBlockedUserMediaUrl("http://postgres-db:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://lavalink:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://invidious-companion:8282/"), true)
        assert.equal(isBlockedUserMediaUrl("http://yt-cipher:8001/"), true)
    })

    it("fails closed on unparseable http(s) strings", () => {
        assert.equal(isBlockedUserMediaUrl("http://"), true)
    })
})
