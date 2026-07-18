import { createGuildAsyncChain } from "./guildAsyncChain.js"

const withGuildPlayerQueueChain = createGuildAsyncChain()

/** Runs `work` after prior guild queue mutations finish (completion order matches request order). */
export function withGuildPlayerQueueLock<T>(guildId: string, work: () => Promise<T>): Promise<T> {
    return withGuildPlayerQueueChain(guildId, work)
}
