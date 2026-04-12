import type BotClient from "../../lib/BotClient.js"

let botClient: BotClient | null = null

export class BotClientNotInitializedError extends Error {
    public readonly code = "BOT_CLIENT_NOT_INITIALIZED"

    constructor() {
        super("Bot client is not initialized yet.")
        this.name = "BotClientNotInitializedError"
    }
}

/** Stores the process-wide bot client for web API/websocket access. */
export function setBotClient(client: BotClient): void {
    if (botClient) {
        console.warn(
            "[botClient] setBotClient called while a BotClient is already registered; ignoring duplicate assignment."
        )
        return
    }
    botClient = client
}

/** Bot client when this Node process also runs the Discord bot; null if only the Next app is running. */
export function tryGetBotClient(): BotClient | null {
    return botClient
}

/** Returns the initialized bot client instance, or throws if not started yet. */
export function getBotClient(): BotClient {
    if (!botClient) {
        throw new BotClientNotInitializedError()
    }
    return botClient
}
