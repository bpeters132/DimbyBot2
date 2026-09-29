import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { controlButtonPresentation } from "./controlButtonPresentation.js"

function playerView(opts: {
    playing?: boolean
    current?: unknown
    upcoming?: number
    autoplay?: boolean
}) {
    return {
        playing: opts.playing ?? false,
        queue: {
            current: opts.current,
            tracks: { length: opts.upcoming ?? 0 },
        },
        get: (key: string) => (key === "autoplay" ? opts.autoplay : undefined),
    }
}

describe("controlButtonPresentation", () => {
    it("disables transport and autoplay when there is no player", () => {
        assert.deepEqual(controlButtonPresentation(null), {
            playPauseLabel: "Play",
            playPauseDisabled: true,
            stopDisabled: true,
            skipDisabled: true,
            shuffleDisabled: true,
            loopDisabled: true,
            autoplayLabel: "Autoplay: Off",
            autoplayDisabled: true,
        })
        assert.equal(controlButtonPresentation(undefined).autoplayDisabled, true)
    })

    it("enables play/stop/skip/loop on a current track and keeps shuffle off without upcoming", () => {
        const idleCurrent = controlButtonPresentation(playerView({ current: { title: "A" } }))
        assert.equal(idleCurrent.playPauseLabel, "Play")
        assert.equal(idleCurrent.playPauseDisabled, false)
        assert.equal(idleCurrent.stopDisabled, false)
        assert.equal(idleCurrent.skipDisabled, false)
        assert.equal(idleCurrent.shuffleDisabled, true)
        assert.equal(idleCurrent.loopDisabled, false)
        assert.equal(idleCurrent.autoplayDisabled, false)
        assert.equal(idleCurrent.autoplayLabel, "Autoplay: Off")
    })

    it("labels pause while playing and enables shuffle only for upcoming tracks", () => {
        const playing = controlButtonPresentation(
            playerView({ playing: true, current: { title: "A" }, upcoming: 2, autoplay: true })
        )
        assert.equal(playing.playPauseLabel, "Pause")
        assert.equal(playing.shuffleDisabled, false)
        assert.equal(playing.loopDisabled, false)
        assert.equal(playing.autoplayLabel, "Autoplay: On")
        assert.equal(playing.autoplayDisabled, false)
    })

    it("keeps play/stop/skip disabled when only upcoming tracks exist (no current)", () => {
        const upcomingOnly = controlButtonPresentation(playerView({ upcoming: 3 }))
        assert.equal(upcomingOnly.playPauseDisabled, true)
        assert.equal(upcomingOnly.stopDisabled, true)
        assert.equal(upcomingOnly.skipDisabled, true)
        assert.equal(upcomingOnly.shuffleDisabled, false)
        assert.equal(upcomingOnly.loopDisabled, false)
        assert.equal(upcomingOnly.autoplayDisabled, false)
    })

    it("disables shuffle until two upcoming tracks exist and keeps loop independent", () => {
        const oneUpcoming = controlButtonPresentation(
            playerView({ current: { title: "A" }, upcoming: 1 })
        )
        assert.equal(oneUpcoming.shuffleDisabled, true)
        assert.equal(oneUpcoming.loopDisabled, false)

        const upcomingOnly = controlButtonPresentation(playerView({ upcoming: 1 }))
        assert.equal(upcomingOnly.shuffleDisabled, true)
        assert.equal(upcomingOnly.loopDisabled, false)
    })

    it("treats a missing tracks array as an empty queue", () => {
        const presentation = controlButtonPresentation({
            playing: true,
            queue: { current: { title: "A" } },
        })
        assert.equal(presentation.shuffleDisabled, true)
        assert.equal(presentation.loopDisabled, false)
        assert.equal(presentation.playPauseDisabled, false)
    })
})
