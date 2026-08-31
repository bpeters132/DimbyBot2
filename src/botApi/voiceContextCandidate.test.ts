import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    selectBestVoiceContextCandidate,
    voiceContextStatusPriority,
    type VoiceContextCandidate,
} from "./voiceContextCandidate.js"

function candidate(
    overrides: Partial<VoiceContextCandidate> & Pick<VoiceContextCandidate, "guildId" | "status">
): VoiceContextCandidate {
    return {
        guildName: overrides.guildName ?? `Guild ${overrides.guildId}`,
        guildIconUrl: overrides.guildIconUrl ?? null,
        currentTrackTitle: overrides.currentTrackTitle ?? null,
        ...overrides,
    }
}

describe("voiceContextStatusPriority", () => {
    it("orders playing before paused before idle", () => {
        assert.equal(voiceContextStatusPriority("playing"), 0)
        assert.equal(voiceContextStatusPriority("paused"), 1)
        assert.equal(voiceContextStatusPriority("idle"), 2)
        assert.ok(voiceContextStatusPriority("playing") < voiceContextStatusPriority("paused"))
        assert.ok(voiceContextStatusPriority("paused") < voiceContextStatusPriority("idle"))
    })
})

describe("selectBestVoiceContextCandidate", () => {
    it("returns null for an empty list", () => {
        assert.equal(selectBestVoiceContextCandidate([]), null)
    })

    it("prefers playing over paused and idle regardless of input order", () => {
        const playing = candidate({
            guildId: "g-play",
            status: "playing",
            currentTrackTitle: "Now",
        })
        const paused = candidate({ guildId: "g-pause", status: "paused" })
        const idle = candidate({ guildId: "g-idle", status: "idle" })
        assert.equal(selectBestVoiceContextCandidate([idle, paused, playing])?.guildId, "g-play")
        assert.equal(selectBestVoiceContextCandidate([paused, playing, idle])?.guildId, "g-play")
    })

    it("prefers paused over idle", () => {
        assert.equal(
            selectBestVoiceContextCandidate([
                candidate({ guildId: "idle", status: "idle" }),
                candidate({ guildId: "paused", status: "paused", currentTrackTitle: "Hold" }),
            ])?.guildId,
            "paused"
        )
    })

    it("keeps the first candidate when status priority ties", () => {
        const first = candidate({
            guildId: "first",
            status: "playing",
            guildName: "First",
            guildIconUrl: "https://cdn.example/a.png",
            currentTrackTitle: "A",
        })
        const second = candidate({
            guildId: "second",
            status: "playing",
            guildName: "Second",
            currentTrackTitle: "B",
        })
        assert.deepEqual(selectBestVoiceContextCandidate([first, second]), first)
    })

    it("preserves guild metadata on the selected candidate and does not mutate input", () => {
        const input: VoiceContextCandidate[] = [
            candidate({
                guildId: "idle",
                status: "idle",
                guildName: "Idle Guild",
                currentTrackTitle: "Old",
            }),
            candidate({
                guildId: "live",
                status: "playing",
                guildName: "Live Guild",
                guildIconUrl: "https://cdn.example/live.png",
                currentTrackTitle: "Live Track",
            }),
        ]
        const snapshot = structuredClone(input)
        const best = selectBestVoiceContextCandidate(input)
        assert.deepEqual(best, {
            guildId: "live",
            guildName: "Live Guild",
            guildIconUrl: "https://cdn.example/live.png",
            status: "playing",
            currentTrackTitle: "Live Track",
        })
        assert.deepEqual(input, snapshot)
    })
})
