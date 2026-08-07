import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    isValidSpotifyArtist,
    resolveSpotifyMarket,
    spotifyTrackToSim,
} from "./similarSongsService.js"

describe("resolveSpotifyMarket", () => {
    it("normalizes valid ISO markets and falls back to US", () => {
        assert.equal(resolveSpotifyMarket("gb"), "GB")
        assert.equal(resolveSpotifyMarket("US"), "US")
        assert.equal(resolveSpotifyMarket(""), "US")
        assert.equal(resolveSpotifyMarket("usa"), "US")
        assert.equal(resolveSpotifyMarket("1"), "US")
        assert.equal(resolveSpotifyMarket(null), "US")
    })

    it("reads SPOTIFY_MARKET then LAVALINK_SPOTIFY_COUNTRY_CODE from env", () => {
        const prevMarket = process.env.SPOTIFY_MARKET
        const prevLavalink = process.env.LAVALINK_SPOTIFY_COUNTRY_CODE
        try {
            delete process.env.SPOTIFY_MARKET
            delete process.env.LAVALINK_SPOTIFY_COUNTRY_CODE
            assert.equal(resolveSpotifyMarket(), "US")

            process.env.LAVALINK_SPOTIFY_COUNTRY_CODE = "ca"
            assert.equal(resolveSpotifyMarket(), "CA")

            process.env.SPOTIFY_MARKET = "de"
            assert.equal(resolveSpotifyMarket(), "DE")

            process.env.SPOTIFY_MARKET = "invalid"
            assert.equal(resolveSpotifyMarket(), "US")
        } finally {
            if (prevMarket === undefined) delete process.env.SPOTIFY_MARKET
            else process.env.SPOTIFY_MARKET = prevMarket
            if (prevLavalink === undefined) delete process.env.LAVALINK_SPOTIFY_COUNTRY_CODE
            else process.env.LAVALINK_SPOTIFY_COUNTRY_CODE = prevLavalink
        }
    })
})

describe("isValidSpotifyArtist", () => {
    it("requires a non-empty string id", () => {
        assert.equal(isValidSpotifyArtist({ id: "abc" }), true)
        assert.equal(isValidSpotifyArtist({ id: "abc", name: "X" }), true)
        assert.equal(isValidSpotifyArtist(null), false)
        assert.equal(isValidSpotifyArtist({}), false)
        assert.equal(isValidSpotifyArtist({ id: "" }), false)
        assert.equal(isValidSpotifyArtist({ id: 1 }), false)
    })
})

describe("spotifyTrackToSim", () => {
    it("maps track payloads and skips excluded / invalid rows", () => {
        const exclude = new Set(["seed"])
        assert.deepEqual(
            spotifyTrackToSim(
                {
                    id: "t1",
                    name: "  Title  ",
                    artists: [{ name: "  Artist  " }],
                },
                exclude
            ),
            { artist: "Artist", title: "Title" }
        )
        assert.deepEqual(spotifyTrackToSim({ id: "t2", name: "Alone", artists: [] }, exclude), {
            artist: "Unknown Artist",
            title: "Alone",
        })
        assert.equal(spotifyTrackToSim({ id: "seed", name: "Nope" }, exclude), null)
        assert.equal(spotifyTrackToSim({ id: "t3", name: "   " }, exclude), null)
        assert.equal(spotifyTrackToSim({ name: "NoId" }, exclude), null)
        assert.equal(spotifyTrackToSim(null, exclude), null)
        assert.equal(spotifyTrackToSim("x", exclude), null)
    })
})
