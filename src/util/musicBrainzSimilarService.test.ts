import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    clampMusicBrainzSimilarLimit,
    isMusicBrainzSimilarDisabled,
    recordingToSim,
    relatedArtistMbidsFromRelations,
} from "./musicBrainzSimilarService.js"

describe("recordingToSim", () => {
    it("maps title and artist-credit name, preferring credit name over nested artist", () => {
        assert.deepEqual(
            recordingToSim({
                title: "  Song  ",
                "artist-credit": [{ name: "  Band  ", artist: { name: "Ignored" } }],
            }),
            { artist: "Band", title: "Song" }
        )
        assert.deepEqual(
            recordingToSim({
                title: "Solo",
                "artist-credit": [{ artist: { name: "  Nested  " } }],
            }),
            { artist: "Nested", title: "Solo" }
        )
    })

    it("fails closed on non-objects and blank titles; uses Unknown Artist without credits", () => {
        assert.equal(recordingToSim(null), null)
        assert.equal(recordingToSim("x"), null)
        assert.equal(recordingToSim({ title: "   " }), null)
        assert.equal(recordingToSim({ title: 12 }), null)
        assert.deepEqual(recordingToSim({ title: "Orphan" }), {
            artist: "Unknown Artist",
            title: "Orphan",
        })
        assert.deepEqual(recordingToSim({ title: "Orphan", "artist-credit": [] }), {
            artist: "Unknown Artist",
            title: "Orphan",
        })
        assert.deepEqual(recordingToSim({ title: "Orphan", "artist-credit": [{}] }), {
            artist: "Unknown Artist",
            title: "Orphan",
        })
    })
})

describe("relatedArtistMbidsFromRelations", () => {
    it("collects unique related MBIDs, skips the seed, and respects the cap", () => {
        assert.deepEqual(relatedArtistMbidsFromRelations(null, "seed"), [])
        assert.deepEqual(
            relatedArtistMbidsFromRelations(
                [
                    { artist: { id: "seed" } },
                    { artist: { id: "a" } },
                    { artist: { id: "a" } },
                    { artist: { id: "b" } },
                    { artist: { id: "c" } },
                    {},
                    { artist: { id: 1 } },
                ],
                "seed",
                2
            ),
            ["a", "b"]
        )
    })
})

describe("clampMusicBrainzSimilarLimit", () => {
    it("defaults invalid values to 15 and clamps to 1…50", () => {
        assert.equal(clampMusicBrainzSimilarLimit(undefined), 15)
        assert.equal(clampMusicBrainzSimilarLimit("nope"), 15)
        assert.equal(clampMusicBrainzSimilarLimit(0), 15)
        assert.equal(clampMusicBrainzSimilarLimit(-3), 1)
        assert.equal(clampMusicBrainzSimilarLimit(1), 1)
        assert.equal(clampMusicBrainzSimilarLimit(50), 50)
        assert.equal(clampMusicBrainzSimilarLimit(999), 50)
    })
})

describe("isMusicBrainzSimilarDisabled", () => {
    it("disables on explicit off flags or missing contact", () => {
        const prevSimilar = process.env.MUSICBRAINZ_SIMILAR
        const prevContact = process.env.MUSICBRAINZ_CONTACT
        const prevContactUrl = process.env.MUSICBRAINZ_CONTACT_URL
        try {
            delete process.env.MUSICBRAINZ_SIMILAR
            delete process.env.MUSICBRAINZ_CONTACT
            delete process.env.MUSICBRAINZ_CONTACT_URL
            assert.equal(isMusicBrainzSimilarDisabled(), true)

            process.env.MUSICBRAINZ_CONTACT = "https://example.com/bot"
            assert.equal(isMusicBrainzSimilarDisabled(), false)

            process.env.MUSICBRAINZ_SIMILAR = "off"
            assert.equal(isMusicBrainzSimilarDisabled(), true)
            process.env.MUSICBRAINZ_SIMILAR = "0"
            assert.equal(isMusicBrainzSimilarDisabled(), true)
            process.env.MUSICBRAINZ_SIMILAR = "false"
            assert.equal(isMusicBrainzSimilarDisabled(), true)

            process.env.MUSICBRAINZ_SIMILAR = "1"
            assert.equal(isMusicBrainzSimilarDisabled(), false)
        } finally {
            if (prevSimilar === undefined) delete process.env.MUSICBRAINZ_SIMILAR
            else process.env.MUSICBRAINZ_SIMILAR = prevSimilar
            if (prevContact === undefined) delete process.env.MUSICBRAINZ_CONTACT
            else process.env.MUSICBRAINZ_CONTACT = prevContact
            if (prevContactUrl === undefined) delete process.env.MUSICBRAINZ_CONTACT_URL
            else process.env.MUSICBRAINZ_CONTACT_URL = prevContactUrl
        }
    })
})
