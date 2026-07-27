import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    formatTrackSearchQuery,
    youtubeSearchQueriesForCatalogTrack,
} from "./similarSongsService.js"

describe("formatTrackSearchQuery", () => {
    it("joins artist and title, and falls back when one side is missing", () => {
        assert.equal(formatTrackSearchQuery({ artist: "A", title: "T" }), "A - T")
        assert.equal(formatTrackSearchQuery({ artist: "  A  ", title: "  T  " }), "A - T")
        assert.equal(formatTrackSearchQuery({ title: "Only Title" }), "Only Title")
        assert.equal(formatTrackSearchQuery({ artist: "Only Artist" }), "Only Artist")
        assert.equal(formatTrackSearchQuery({}), "")
        assert.equal(formatTrackSearchQuery({ artist: "  ", title: "" }), "")
    })
})

describe("youtubeSearchQueriesForCatalogTrack", () => {
    it("returns an empty list when artist and title are blank", () => {
        assert.deepEqual(youtubeSearchQueriesForCatalogTrack({}), [])
        assert.deepEqual(youtubeSearchQueriesForCatalogTrack({ artist: " ", title: " " }), [])
    })

    it("orders ytsearch variants from specific official audio to bare query", () => {
        const queries = youtubeSearchQueriesForCatalogTrack({
            artist: "Artist",
            title: "Song",
        })
        assert.deepEqual(queries, [
            "ytsearch:Artist - Song official audio",
            "ytsearch:Artist - Song official music video",
            "ytsearch:Artist - Song audio",
            "ytsearch:Artist - Song",
        ])
    })
})
