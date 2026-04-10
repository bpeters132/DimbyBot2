import type BotClient from "../../lib/BotClient.js"

let botClient: BotClient | null = null

/** Stores the process-wide bot client for web API/websocket access. */
export function setBotClient(client: BotClient): void {
    botClient = client
}

/** Bot client when this Node process also runs the Discord bot; null if only the Next app is running. */
export function tryGetBotClient(): BotClient | null {
    return botClient
}

/** Returns the initialized bot client instance, or throws if not started yet. */
export function getBotClient(): BotClient {
    if (!botClient) {
        throw new Error("Bot client is not initialized yet.")
    }
    return botClient
}
