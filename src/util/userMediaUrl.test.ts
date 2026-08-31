import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    isBlockedUserMediaUrl,
    isHttpUrlQuery,
    trimmedHttpUrlQuery,
    unwrapLavalinkSourcePrefix,
} from "./userMediaUrl.js"

describe("isHttpUrlQuery", () => {
    it("detects http(s) prefixes", () => {
        assert.equal(isHttpUrlQuery("https://youtube.com/watch?v=dQw4w9WgXcQ"), true)
        assert.equal(isHttpUrlQuery("  http://open.spotify.com/track/abc  "), true)
        assert.equal(isHttpUrlQuery("HTTP://127.0.0.1/"), true)
        assert.equal(isHttpUrlQuery("never gonna give you up"), false)
        assert.equal(isHttpUrlQuery("ytsearch:rick astley"), false)
    })
})

describe("trimmedHttpUrlQuery", () => {
    it("returns the trimmed URL for whitespace-padded public catalog URLs", () => {
        assert.equal(
            trimmedHttpUrlQuery("  https://www.youtube.com/watch?v=dQw4w9WgXcQ  "),
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )
        assert.equal(trimmedHttpUrlQuery("never gonna give you up"), null)
    })
})

describe("unwrapLavalinkSourcePrefix", () => {
    it("strips link/uri and short search-source wrappers", () => {
        assert.equal(unwrapLavalinkSourcePrefix("link:http://127.0.0.1/"), "http://127.0.0.1/")
        assert.equal(unwrapLavalinkSourcePrefix("URI:http://postgres-db/"), "http://postgres-db/")
        assert.equal(unwrapLavalinkSourcePrefix("yt:http://10.0.0.5/"), "http://10.0.0.5/")
        assert.equal(unwrapLavalinkSourcePrefix("sc:http://169.254.169.254/"), "http://169.254.169.254/")
        assert.equal(unwrapLavalinkSourcePrefix("local:http://127.0.0.1/"), "http://127.0.0.1/")
        assert.equal(
            unwrapLavalinkSourcePrefix("ytsearch:never gonna give you up"),
            "never gonna give you up"
        )
    })

    it("prefers longer prefixes over short aliases", () => {
        assert.equal(
            unwrapLavalinkSourcePrefix("ytsearch:http://127.0.0.1/"),
            "http://127.0.0.1/"
        )
        assert.equal(unwrapLavalinkSourcePrefix("scsearch:http://10.0.0.1/"), "http://10.0.0.1/")
    })

    it("returns null when no wrapper is present", () => {
        assert.equal(unwrapLavalinkSourcePrefix("http://127.0.0.1/"), null)
        assert.equal(unwrapLavalinkSourcePrefix("never gonna give you up"), null)
    })
})

describe("isBlockedUserMediaUrl", () => {
    it("allows public catalog hosts", () => {
        assert.equal(isBlockedUserMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), false)
        assert.equal(isBlockedUserMediaUrl("https://youtu.be/dQw4w9WgXcQ"), false)
        assert.equal(isBlockedUserMediaUrl("https://open.spotify.com/track/abc"), false)
        assert.equal(isBlockedUserMediaUrl("https://soundcloud.com/artist/track"), false)
        assert.equal(isBlockedUserMediaUrl("never gonna give you up"), false)
        assert.equal(isBlockedUserMediaUrl("ytsearch:never gonna give you up"), false)
        assert.equal(
            isBlockedUserMediaUrl("link:https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            false
        )
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
        assert.equal(isBlockedUserMediaUrl("http://[::]/"), true)
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

    it("rejects private hosts wrapped in lavalink-client source prefixes", () => {
        assert.equal(isBlockedUserMediaUrl("link:http://127.0.0.1:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://postgres-db:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("LINK:http://10.0.0.5/"), true)
        assert.equal(isBlockedUserMediaUrl("yt:http://127.0.0.1/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://postgres-db:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("sc:http://169.254.169.254/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://192.168.1.1/"), true)
        assert.equal(isBlockedUserMediaUrl("spsearch:http://172.16.0.2/"), true)
        assert.equal(isBlockedUserMediaUrl("bcsearch:http://127.0.0.1/"), true)
    })

    it("fails closed on unparseable http(s) strings", () => {
        assert.equal(isBlockedUserMediaUrl("http://"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://"), true)
    })
})
