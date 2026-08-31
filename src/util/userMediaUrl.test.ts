import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    isBlockedUserMediaUrl,
    isHttpUrlQuery,
    trimmedHttpUrlQuery,
    unwrapDirectLinkSourcePrefix,
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
        assert.equal(isBlockedUserMediaUrl("http://0.0.0.0/"), true)
        assert.equal(isBlockedUserMediaUrl("http://[::]/"), true)
        assert.equal(isBlockedUserMediaUrl("http://[::1]/"), true)
        assert.equal(isBlockedUserMediaUrl("http://[::ffff:127.0.0.1]/"), true)
        // Hex-form IPv4-mapped addresses (::ffff:AABB:CCDD) are a common SSRF bypass shape.
        assert.equal(isBlockedUserMediaUrl("http://[::ffff:7f00:1]/"), true) // 127.0.0.1
        assert.equal(isBlockedUserMediaUrl("http://[::ffff:0a00:1]/"), true) // 10.0.0.1
        assert.equal(isBlockedUserMediaUrl("http://[::ffff:c0a8:1]/"), true) // 192.168.0.1
        assert.equal(isBlockedUserMediaUrl("http://[fd12:3456:789a:1::1]/"), true)
        assert.equal(isBlockedUserMediaUrl("http://[fe90::1]/"), true)
        assert.equal(isBlockedUserMediaUrl("http://[febf::1]/"), true) // still fe80::/10
    })

    it("rejects Docker-internal single-label hosts", () => {
        assert.equal(isBlockedUserMediaUrl("http://postgres-db:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://lavalink:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://invidious-companion:8282/"), true)
        assert.equal(isBlockedUserMediaUrl("http://yt-cipher:8001/"), true)
    })

    it("rejects DNS-bounce hosts that resolve to private or loopback IPs", () => {
        assert.equal(isBlockedUserMediaUrl("http://10.0.0.1.nip.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://192.168.1.1.sslip.io/audio.mp3"), true)
        assert.equal(isBlockedUserMediaUrl("http://127.0.0.1.nip.io:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://169.254.169.254.nip.io/latest/meta-data/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localtest.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localtest.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://lvh.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://vcap.me/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://10.0.0.5.NIP.IO/"), true)
        // Embedded blocked IPv4 labels even under an unfamiliar suffix
        assert.equal(isBlockedUserMediaUrl("http://172.16.0.2.attacker.example/"), true)
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

    it("rejects link:/uri: wrappers around private or Docker-internal HTTP targets", () => {
        // lavalink-client strips link:/uri: and sends the remainder as /loadtracks identifier
        assert.equal(isBlockedUserMediaUrl("link:http://127.0.0.1:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://postgres-db:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("LINK:http://10.0.0.5/audio.mp3"), true)
        assert.equal(isBlockedUserMediaUrl("  uri:HTTP://localhost:3001/ws  "), true)
        assert.equal(isBlockedUserMediaUrl("link:http://192.168.1.10/track.mp3"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://[::1]/"), true)
        assert.equal(
            isBlockedUserMediaUrl("link:https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            false
        )
        assert.equal(isBlockedUserMediaUrl("uri:https://soundcloud.com/artist/track"), false)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://127.0.0.1/"), false)
    })
})

describe("unwrapDirectLinkSourcePrefix", () => {
    it("strips link:/uri: once and leaves other queries unchanged", () => {
        assert.equal(unwrapDirectLinkSourcePrefix("link:http://127.0.0.1/"), "http://127.0.0.1/")
        assert.equal(unwrapDirectLinkSourcePrefix("URI:https://example.com/a"), "https://example.com/a")
        assert.equal(unwrapDirectLinkSourcePrefix("  link: http://x/ "), "http://x/")
        assert.equal(unwrapDirectLinkSourcePrefix("http://127.0.0.1/"), "http://127.0.0.1/")
        assert.equal(unwrapDirectLinkSourcePrefix("ytsearch:rick"), "ytsearch:rick")
    })
})
