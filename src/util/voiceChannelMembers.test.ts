import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { VoiceBasedChannel } from "discord.js"
import { countHumanMembers } from "./voiceChannelMembers.js"

type VoiceStateLike = { channelId: string | null; id: string }

function mockVoiceChannel(opts: {
    channelId: string
    botId?: string | null
    voiceStates: VoiceStateLike[]
}): VoiceBasedChannel {
    const cache = {
        filter(predicate: (vs: VoiceStateLike) => boolean) {
            const matches = opts.voiceStates.filter(predicate)
            return { size: matches.length }
        },
    }
    return {
        id: opts.channelId,
        guild: {
            client: { user: opts.botId === null ? null : { id: opts.botId ?? "bot-1" } },
            voiceStates: { cache },
        },
    } as unknown as VoiceBasedChannel
}

describe("countHumanMembers", () => {
    it("counts voiceStates in this channel and excludes the bot by id", () => {
        const channel = mockVoiceChannel({
            channelId: "vc-1",
            botId: "bot-1",
            voiceStates: [
                { id: "bot-1", channelId: "vc-1" },
                { id: "human-1", channelId: "vc-1" },
                { id: "human-2", channelId: "vc-1" },
                { id: "human-other", channelId: "vc-2" },
            ],
        })
        assert.equal(countHumanMembers(channel), 2)
    })

    it("returns 0 when only the bot (or nobody) is in the channel", () => {
        assert.equal(
            countHumanMembers(
                mockVoiceChannel({
                    channelId: "vc-1",
                    voiceStates: [{ id: "bot-1", channelId: "vc-1" }],
                })
            ),
            0
        )
        assert.equal(
            countHumanMembers(mockVoiceChannel({ channelId: "vc-1", voiceStates: [] })),
            0
        )
    })

    it("does not rely on GuildMember cache (voiceStates remain authoritative)", () => {
        // Regression: voiceChannel.members can be empty when members are uncached even though
        // humans are connected — restore must not delete the session in that case.
        const channel = mockVoiceChannel({
            channelId: "vc-1",
            voiceStates: [{ id: "human-uncached", channelId: "vc-1" }],
        })
        assert.equal(countHumanMembers(channel), 1)
    })
})
