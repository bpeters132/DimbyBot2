import type {
  ChannelDeletePacket,
  VoicePacket,
  VoiceServer,
  VoiceState,
} from "lavalink-client"
import type BotClient from "../lib/BotClient.js"

type LavalinkRaw = VoicePacket | VoiceServer | VoiceState | ChannelDeletePacket

export default async (client: BotClient) => {
  client.on("raw", (data) => {
    client.lavalink.sendRawData(data as LavalinkRaw).catch((err: unknown) => {
      client.error("[onRaw] sendRawData failed:", err)
    })
  })
}
