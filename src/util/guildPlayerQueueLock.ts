/** Per-guild FIFO chain for player queue mutations (enqueue vs orphan teardown). */
const guildPlayerQueueChain = new Map<string, Promise<unknown>>()

/** Runs `work` after prior guild queue mutations finish (completion order matches request order). */
export function withGuildPlayerQueueLock<T>(guildId: string, work: () => Promise<T>): Promise<T> {
    const prior = guildPlayerQueueChain.get(guildId) ?? Promise.resolve()
    const result = prior.then(() => work())
    guildPlayerQueueChain.set(
        guildId,
        result.then(
            () => undefined,
            () => undefined
        )
    )
    return result
}
