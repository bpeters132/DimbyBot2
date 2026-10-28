import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isAllowedYoutubeDownloadUrl } from "../../src/util/youtubeDownloadUrl.js"

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
})
