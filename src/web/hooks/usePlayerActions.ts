"use client"

import { useMemo } from "react"
import type { PlayerStateResponse } from "@/types/web"
import {
    type PlayerCommand,
    postPlayerCommandAction,
    postPlayerPlayAction,
} from "@/server/player.actions"

async function runCommand(
    guildId: string,
    command: PlayerCommand,
    value?: number
): Promise<PlayerStateResponse> {
    const result = await postPlayerCommandAction(guildId, command, value)
    if (result.ok === false) {
        throw new Error(result.error)
    }
    return result.data
}

export function usePlayerActions(guildId: string, requesterDiscordUserId: string | undefined) {
    return useMemo(
        () => ({
            playPause: () => runCommand(guildId, "pause"),
            stop: () => runCommand(guildId, "stop"),
            skip: () => runCommand(guildId, "skip"),
            shuffle: () => runCommand(guildId, "shuffle"),
            toggleLoop: () => runCommand(guildId, "loop"),
            toggleAutoplay: () => runCommand(guildId, "autoplay"),
            seek: (positionMs: number) => runCommand(guildId, "seek", positionMs),
            addTrack: async (query: string) => {
                const requesterId = requesterDiscordUserId?.trim()
                if (!requesterId) {
                    throw new Error(
                        "Missing Discord user id for this session. Refresh the page or sign in again."
                    )
                }
                const result = await postPlayerPlayAction(guildId, query, requesterId)
                if (result.ok === false) {
                    throw new Error(result.error)
                }
                return result.data
            },
        }),
        [guildId, requesterDiscordUserId]
    )
}
