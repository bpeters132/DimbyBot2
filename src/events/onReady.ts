import { ActivityType } from "discord.js"
import type BotClient from "../lib/BotClient.js"
import { attachDiscordLogForwarding } from "../util/discordLogForward.js"
import { refreshAllControlMessages } from "./handlers/handleControlChannel.js"

export default async (client: BotClient) => {
    client.on("clientReady", () => {
        const user = client.user
        if (!user) {
            client.error("clientReady fired but client.user is null")
            return
        }
        client.debug("Ready event triggered.") // Debug log
        client.lavalink.init({ id: user.id, username: user.username })

        client.info(`Logged in as ${user.tag}! (${user.id})`)

        try {
            attachDiscordLogForwarding(client)
        } catch (err: unknown) {
            client.error("[onReady] attachDiscordLogForwarding failed:", err)
        }

        refreshAllControlMessages(client).catch((err: unknown) =>
            client.error("[ControlHandler] refreshAllControlMessages failed:", err)
        )

        user.setActivity("I hate that Pancake guy!", { type: ActivityType.Custom })

        // Create a toggle for status rotation
        let showGuildCount = true

        setInterval(
            async () => {
                try {
                    client.debug("Status update interval triggered.") // Debug log
                    if (showGuildCount) {
                        const guildCount = client.guilds.cache.size
                        client.debug(`Setting status to watch ${guildCount} servers.`) // Debug log
                        await user.setActivity(`${guildCount} servers`, {
                            type: ActivityType.Watching,
                        })
                        client.info(`Set status to ${guildCount} servers`)
                    } else {
                        client.debug("Setting status to 'I hate that Pancake guy!'.") // Debug log
                        await user.setActivity("I hate that Pancake guy!", {
                            type: ActivityType.Custom,
                        })
                        client.info("I hate that Pancake guy!")
                    }
                    showGuildCount = !showGuildCount
                    client.debug(`showGuildCount toggled to: ${showGuildCount}`) // Debug log
                } catch (err: unknown) {
                    client.error(
                        `[onReady] setActivity failed (showGuildCount was ${showGuildCount}, guildCount=${client.guilds.cache.size}):`,
                        err
                    )
                }
            },
            10 * 60 * 1000
        ) // Change status every 10 minutes
    })
}
