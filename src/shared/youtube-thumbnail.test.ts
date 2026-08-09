import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { playlistTrackThumbnailUrl, thumbnailUrlFromUri } from "./youtube-thumbnail.js"

describe("thumbnailUrlFromUri", () => {
    it("extracts YouTube ids across common host/path shapes", () => {
        const id = "dQw4w9WgXcQ"
        const expected = `https://img.youtube.com/vi/${id}/hqdefault.jpg`
        assert.equal(thumbnailUrlFromUri(`https://www.youtube.com/watch?v=${id}`), expected)
        assert.equal(thumbnailUrlFromUri(`https://youtu.be/${id}`), expected)
        assert.equal(thumbnailUrlFromUri(`https://www.youtube.com/embed/${id}`), expected)
        assert.equal(thumbnailUrlFromUri(`https://www.youtube.com/shorts/${id}`), expected)
        assert.equal(
            thumbnailUrlFromUri(`https://music.youtube.com/watch?v=${id}&list=x`),
            expected
        )
    })

    it("returns null for blank or non-YouTube URIs", () => {
        assert.equal(thumbnailUrlFromUri(""), null)
        assert.equal(thumbnailUrlFromUri("   "), null)
        assert.equal(thumbnailUrlFromUri("https://open.spotify.com/track/abc"), null)
        assert.equal(thumbnailUrlFromUri("https://www.youtube.com/watch?v=short"), null)
    })
})

describe("playlistTrackThumbnailUrl", () => {
    it("prefers a sanitized stored thumbnail over URI fallback", () => {
        assert.equal(
            playlistTrackThumbnailUrl({
                thumbnailUrl: "https://cdn.example/art.jpg",
                uri: "https://youtu.be/dQw4w9WgXcQ",
            }),
            "https://cdn.example/art.jpg"
        )
    })

    it("rejects unsafe stored thumbnails and falls back to a YouTube URI", () => {
        assert.equal(
            playlistTrackThumbnailUrl({
                thumbnailUrl: "javascript:alert(1)",
                uri: "https://youtu.be/dQw4w9WgXcQ",
            }),
            "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
        )
        assert.equal(
            playlistTrackThumbnailUrl({
                thumbnailUrl: "data:image/png;base64,abc",
                uri: "https://open.spotify.com/track/abc",
            }),
            null
        )
    })

    it("returns null when neither stored art nor URI yields a safe http(s) URL", () => {
        assert.equal(
            playlistTrackThumbnailUrl({
                thumbnailUrl: null,
                uri: "https://open.spotify.com/track/abc",
            }),
            null
        )
        assert.equal(playlistTrackThumbnailUrl({ thumbnailUrl: "", uri: "" }), null)
    })
})
