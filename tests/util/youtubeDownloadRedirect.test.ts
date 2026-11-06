import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isAllowedYoutubeDownloadUrl } from "../../src/util/youtubeDownloadRedirect.js"

const REDIRECT = "https://www.youtube.com/redirect?event=video_description&redir_token=x&q="

describe("isAllowedYoutubeDownloadUrl", () => {
    it("allows ordinary YouTube watch, short, and youtu.be URLs", () => {
        assert.equal(
            isAllowedYoutubeDownloadUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            true
        )
        assert.equal(isAllowedYoutubeDownloadUrl("https://youtu.be/dQw4w9WgXcQ"), true)
        assert.equal(isAllowedYoutubeDownloadUrl("https://www.youtube.com/shorts/abc123"), true)
        assert.equal(
            isAllowedYoutubeDownloadUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ"),
            true
        )
        assert.equal(isAllowedYoutubeDownloadUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), true)
    })

    it("rejects YouTube /redirect URLs whose q target is a private host", () => {
        for (const target of [
            "http://127.0.0.1/latest/meta-data/",
            "http://10.0.0.1/latest/meta-data/",
            "http://169.254.169.254/latest/meta-data/",
            "http://lavalink/",
        ]) {
            assert.equal(isAllowedYoutubeDownloadUrl(`${REDIRECT}${target}`), false)
        }
    })

    it("rejects redirect path variants that still reach YouTube's redirector", () => {
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://www.youtube.com/Redirect?q=http://127.0.0.1/latest/meta-data/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://www.youtube.com/redirect/videos?q=http://127.0.0.1/latest/meta-data/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://www.youtube.com/watch/../redirect?q=http://127.0.0.1/latest/meta-data/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://www.youtube.com/redirect%2Fvideos?q=http://127.0.0.1/latest/meta-data/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://m.youtube.com/redirect?q=http://169.254.169.254/latest/meta-data/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://www.youtube.com/redirect\\videos?q=http://127.0.0.1/latest/meta-data/"
            ),
            false
        )
    })

    it("rejects backslash userinfo whose urllib path is /redirect or whose host is consent.youtube.com", () => {
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://www.youtube.com\\@www.youtube.com/redirect?q=http://127.0.0.1/latest/meta-data/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://www.youtube.com\\@www.youtube.com/redirect/videos?q=http://10.0.0.1/latest/meta-data/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://www.youtube.com\\@www.youtube.com/watch/../redirect?q=http://127.0.0.1/latest/meta-data/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://www.youtube.com\\@www.youtube.com/Redirect?q=http://127.0.0.1/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://www.youtube.com\\@www.youtube.com/redirect%2Fvideos?q=http://169.254.169.254/latest/meta-data/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://youtu.be\\@m.youtube.com/redirect?q=http://postgres-db:5432/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://www.youtube.com\\@consent.youtube.com/m?continue=http://127.0.0.1/latest/meta-data/"
            ),
            false
        )
        assert.equal(
            isAllowedYoutubeDownloadUrl(
                "https://music.youtube.com\\@consent.youtube.com/m?continue=http://lavalink/"
            ),
            false
        )
    })

    it("rejects non-YouTube hosts", () => {
        assert.equal(isAllowedYoutubeDownloadUrl("https://example.com/watch?v=dQw4w9WgXcQ"), false)
        assert.equal(isAllowedYoutubeDownloadUrl("not a url"), false)
    })
})
