import type BotClient from "../lib/BotClient.js"

export default async (client: BotClient) => {
  client.on("error", (err: Error) => {
    client.info(`Error event triggered: ${err}`)
  })
}
