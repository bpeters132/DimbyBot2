import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isAllowedYoutubeDownloadHostUrl } from "../../src/util/youtubeDownloadHost.js"

describe("isAllowedYoutubeDownloadHostUrl", () => {
    it("allows ordinary YouTube watch hosts", () => {
        assert.equal(
            isAllowedYoutubeDownloadHostUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            true
        )
        assert.equal(
            isAllowedYoutubeDownloadHostUrl("https://youtube.com/watch?v=dQw4w9WgXcQ"),
            true
        )
        assert.equal(isAllowedYoutubeDownloadHostUrl("https://youtu.be/dQw4w9WgXcQ"), true)
        assert.equal(
            isAllowedYoutubeDownloadHostUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ"),
            true
        )
        assert.equal(
            isAllowedYoutubeDownloadHostUrl("http://m.youtube.com/shorts/dQw4w9WgXcQ"),
            true
        )
    })

    it("rejects consent.youtube.com continue URLs that yt-dlp fetches directly", () => {
        assert.equal(
            isAllowedYoutubeDownloadHostUrl(
                "https://consent.youtube.com/m?continue=http%3A%2F%2F127.0.0.1%3A8765%2Flatest%2Fmeta-data%2F"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadHostUrl(
                "https://consent.youtube.com/m?continue=http%3A%2F%2Fpostgres-db%3A5432%2F"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadHostUrl(
                "https://consent.youtube.com/m?continue=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F"
            ),
            false
        )
    })

    it("rejects other non-download YouTube subdomains and non-YouTube hosts", () => {
        assert.equal(isAllowedYoutubeDownloadHostUrl("https://studio.youtube.com/"), false)
        assert.equal(isAllowedYoutubeDownloadHostUrl("https://example.com/watch"), false)
        assert.equal(isAllowedYoutubeDownloadHostUrl("http://127.0.0.1/"), false)
        assert.equal(isAllowedYoutubeDownloadHostUrl("not a url"), false)
    })
})
