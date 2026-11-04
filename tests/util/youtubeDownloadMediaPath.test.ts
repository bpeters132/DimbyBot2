import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isAllowedYoutubeDownloadMediaUrl } from "../../src/util/youtubeDownloadMediaPath.js"

const VIDEO = "dQw4w9WgXcQ"

describe("isAllowedYoutubeDownloadMediaUrl", () => {
    it("allows ordinary watch, short, embed, live, playlist, and youtu.be URLs", () => {
        assert.equal(
            isAllowedYoutubeDownloadMediaUrl(`https://www.youtube.com/watch?v=${VIDEO}`),
            true
        )
        assert.equal(
            isAllowedYoutubeDownloadMediaUrl(`https://www.youtube.com/watch?v=${VIDEO}&t=43s`),
            true
        )
        assert.equal(isAllowedYoutubeDownloadMediaUrl(`https://youtu.be/${VIDEO}`), true)
        assert.equal(isAllowedYoutubeDownloadMediaUrl(`https://youtu.be/${VIDEO}?si=abc`), true)
        assert.equal(isAllowedYoutubeDownloadMediaUrl(`https://youtube.com/watch?v=${VIDEO}`), true)
        assert.equal(
            isAllowedYoutubeDownloadMediaUrl(`https://m.youtube.com/watch?v=${VIDEO}`),
            true
        )
        assert.equal(
            isAllowedYoutubeDownloadMediaUrl(`https://music.youtube.com/watch?v=${VIDEO}`),
            true
        )
        assert.equal(
            isAllowedYoutubeDownloadMediaUrl(`https://www.youtube.com/shorts/${VIDEO}`),
            true
        )
        assert.equal(
            isAllowedYoutubeDownloadMediaUrl(`https://www.youtube.com/embed/${VIDEO}`),
            true
        )
        assert.equal(
            isAllowedYoutubeDownloadMediaUrl(`https://www.youtube.com/live/${VIDEO}`),
            true
        )
        assert.equal(isAllowedYoutubeDownloadMediaUrl(`https://www.youtube.com/v/${VIDEO}`), true)
        assert.equal(
            isAllowedYoutubeDownloadMediaUrl(
                "https://www.youtube.com/playlist?list=PL2qgrgXsNUG5ig9cat4ohreBjYLAPC0J5"
            ),
            true
        )
    })

    it("rejects attribution_link URLs that wrap a YouTube redirect to a private host", () => {
        const wrapped = `/redirect?event=video_description&redir_token=x&q=${encodeURIComponent("http://127.0.0.1/latest/meta-data/")}`
        for (const host of [
            "www.youtube.com",
            "m.youtube.com",
            "music.youtube.com",
            "youtube.com",
        ]) {
            const url = `https://${host}/attribution_link?a=1&u=${encodeURIComponent(wrapped)}`
            assert.equal(isAllowedYoutubeDownloadMediaUrl(url), false)
        }
        assert.equal(
            isAllowedYoutubeDownloadMediaUrl(
                "https://www.youtube.com/attribution_link?a=1&u=http%3A%2F%2F127.0.0.1%2F"
            ),
            false
        )
    })

    it("rejects other non-video YouTube paths, including redirect and dot-segment tricks", () => {
        assert.equal(
            isAllowedYoutubeDownloadMediaUrl(
                "https://www.youtube.com/redirect?event=video_description&redir_token=x&q=http://127.0.0.1/latest/meta-data/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadMediaUrl(
                "https://www.youtube.com/watch/../attribution_link?a=1&u=%2Fredirect"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadMediaUrl(
                "https://www.youtube.com/attribution%5Flink?a=1&u=%2Fredirect"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadMediaUrl(
                "https://consent.youtube.com/m?continue=http://127.0.0.1/latest/meta-data/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadMediaUrl("https://example.com/watch?v=" + VIDEO),
            false
        )
        assert.equal(isAllowedYoutubeDownloadMediaUrl("not a url"), false)
    })
})
