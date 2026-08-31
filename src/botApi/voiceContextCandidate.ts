import type { ActivePlayerGuildContext } from "../types/web.js"

/** Candidate guild for dashboard “continue listening” selection. */
export type VoiceContextCandidate = ActivePlayerGuildContext

/** Lower number = preferred (playing → paused → idle). */
export function voiceContextStatusPriority(status: VoiceContextCandidate["status"]): number {
    return status === "playing" ? 0 : status === "paused" ? 1 : 2
}

/**
 * Picks the best active-player guild for voice context.
 * Playing beats paused beats idle; equal priority keeps the first candidate (input order).
 * Does not mutate `candidates`.
 */
export function selectBestVoiceContextCandidate(
    candidates: readonly VoiceContextCandidate[]
): VoiceContextCandidate | null {
    if (candidates.length === 0) return null
    let best = candidates[0]
    let bestPriority = voiceContextStatusPriority(best.status)
    for (let i = 1; i < candidates.length; i++) {
        const candidate = candidates[i]
        const priority = voiceContextStatusPriority(candidate.status)
        if (priority < bestPriority) {
            best = candidate
            bestPriority = priority
        }
    }
    return best
}
