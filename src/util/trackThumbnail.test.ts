import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { thumbnailFromLavalinkTrack, thumbnailUrlFromUri } from "./trackThumbnail.js"

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

describe("thumbnailFromLavalinkTrack", () => {
    it("prefers artworkUrl, then YouTube identifier, then URI parse", () => {
        assert.equal(
            thumbnailFromLavalinkTrack({
                info: { artworkUrl: "https://cdn.example/art.jpg", uri: "" },
            } as never),
            "https://cdn.example/art.jpg"
        )
        assert.equal(
            thumbnailFromLavalinkTrack({
                info: {
                    identifier: "dQw4w9WgXcQ",
                    sourceName: "youtube",
                    uri: "https://example.com",
                },
            } as never),
            "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
        )
        assert.equal(
            thumbnailFromLavalinkTrack({
                info: {
                    sourceName: "http",
                    uri: "https://youtu.be/dQw4w9WgXcQ",
                },
            } as never),
            "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
        )
    })
})
