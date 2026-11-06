import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isAllowedYoutubeDownloadHostUrl } from "../../src/util/youtubeDownloadHost.js"
import { isAllowedYoutubeDownloadUrl as isAllowedYoutubeDownloadRedirectUrl } from "../../src/util/youtubeDownloadRedirect.js"
import {
    isAllowedYoutubeDownloadUrl,
    urllibRequestHostname,
} from "../../src/util/youtubeDownloadUrl.js"

/** YouTube name, backslash, `@`, then another YouTube name. WHATWG hides the real host. */
const BACKSLASH_USERINFO_BYPASS = [
    "https://www.youtube.com\\@www.youtube.com/redirect?q=http://127.0.0.1/latest/meta-data/",
    "https://www.youtube.com\\@consent.youtube.com/m?continue=http://127.0.0.1/latest/meta-data/",
    "https://youtu.be\\@m.youtube.com/redirect?q=http://169.254.169.254/latest/meta-data/",
    "https://music.youtube.com\\@consent.youtube.com/m?continue=http://lavalink/",
    "http://m.youtube.com\\@www.youtube.com/redirect?q=http://postgres-db:5432/",
    "https://www.youtube.com\\@www.youtube.com/redirect/videos?q=http://10.0.0.1/latest/meta-data/",
    "https://www.youtube.com\\@www.youtube.com/watch/../redirect?q=http://127.0.0.1/latest/meta-data/",
    "https://www.youtube.com\\@www.youtube.com/Redirect?q=http://127.0.0.1/",
    "https://www.youtube.com\\@www.youtube.com/redirect%2Fvideos?q=http://127.0.0.1/latest/meta-data/",
    "https://youtube.com\\@music.youtube.com/redirect?q=http://127.0.0.1/",
    "https://www.youtube.com\\@consent.youtube.com/m?continue=http://169.254.169.254/latest/meta-data/",
]

describe("isAllowedYoutubeDownloadUrl", () => {
    it("allows ordinary YouTube watch and short URLs", () => {
        assert.equal(
            isAllowedYoutubeDownloadUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            true
        )
        assert.equal(isAllowedYoutubeDownloadUrl("https://youtu.be/dQw4w9WgXcQ"), true)
        assert.equal(
            isAllowedYoutubeDownloadUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ"),
            true
        )
        assert.equal(isAllowedYoutubeDownloadUrl("http://m.youtube.com/watch?v=dQw4w9WgXcQ"), true)
    })

    it("rejects non-YouTube hosts", () => {
        assert.equal(isAllowedYoutubeDownloadUrl("https://example.com/watch"), false)
        assert.equal(isAllowedYoutubeDownloadUrl("http://127.0.0.1/"), false)
        assert.equal(isAllowedYoutubeDownloadUrl("http://10.0.0.1/"), false)
    })

    it("rejects backslash userinfo that yt-dlp fetches from a private host", () => {
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "http://www.youtube.com\\@127.0.0.1:8765/latest/meta-data/"
            ),
            false
        )
        assert.equal(isAllowedYoutubeDownloadUrl("https://www.youtube.com\\@10.0.0.1/"), false)
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "http://www.youtube.com\\@169.254.169.254/latest/meta-data/"
            ),
            false
        )
        assert.equal(isAllowedYoutubeDownloadUrl("https://youtu.be\\@127.0.0.1/"), false)
        assert.equal(
            isAllowedYoutubeDownloadUrl("http://music.youtube.com\\@lavalink:2333/version"),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl("http://m.youtube.com\\@192.168.1.1/audio.wav"),
            false
        )
    })

    it("reads the urllib host after a backslash, not the WHATWG host", () => {
        assert.equal(
            urllibRequestHostname(
                "https://www.youtube.com\\@consent.youtube.com/m?continue=http://127.0.0.1/"
            ),
            "consent.youtube.com"
        )
        assert.equal(
            urllibRequestHostname(
                "https://www.youtube.com\\@www.youtube.com/redirect?q=http://127.0.0.1/"
            ),
            "www.youtube.com"
        )
        assert.equal(
            urllibRequestHostname("http://www.youtube.com\\@127.0.0.1:8765/latest/meta-data/"),
            "127.0.0.1"
        )
    })

    it("rejects backslash userinfo that yt-dlp fetches as /redirect or consent.youtube.com", () => {
        for (const url of BACKSLASH_USERINFO_BYPASS) {
            assert.equal(isAllowedYoutubeDownloadUrl(url), false, url)
            assert.equal(isAllowedYoutubeDownloadHostUrl(url), false, url)
            assert.equal(isAllowedYoutubeDownloadRedirectUrl(url), false, url)
        }
    })

    it("rejects consent.youtube.com and /redirect with the same urllib parse", () => {
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://consent.youtube.com/m?continue=http://127.0.0.1/latest/meta-data/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://www.youtube.com/redirect?q=http://127.0.0.1/latest/meta-data/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://www.youtube.com/redirect\\videos?q=http://127.0.0.1/latest/meta-data/"
            ),
            false
        )
        assert.equal(isAllowedYoutubeDownloadUrl("https://studio.youtube.com/channel/UC"), false)
    })
})
