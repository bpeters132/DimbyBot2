/**
 * Per-key FIFO async chain. Removes the registry entry when the tail settles,
 * but only if the map still points at that same tail (newer work may have replaced it).
 */
export function createGuildAsyncChain(): <T>(
    guildId: string,
    work: () => Promise<T>
) => Promise<T> {
    const chainByGuild = new Map<string, Promise<unknown>>()

    return function withGuildAsyncChain<T>(guildId: string, work: () => Promise<T>): Promise<T> {
        const prior = chainByGuild.get(guildId) ?? Promise.resolve()
        const result = prior.then(() => work())
        const tail = result.then(
            () => undefined,
            () => undefined
        )
        chainByGuild.set(guildId, tail)
        void tail.finally(() => {
            if (chainByGuild.get(guildId) === tail) {
                chainByGuild.delete(guildId)
            }
        })
        return result
    }
}
