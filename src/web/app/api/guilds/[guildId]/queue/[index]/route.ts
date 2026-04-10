/**
 * Proxies queue index mutations to the bot API with the caller’s cookies — preserves raw HTTP
 * (PATCH/DELETE bodies) and a single trusted hop from Next to the bot process.
 */
import { proxyBotApi } from "@/server/bot-api-proxy"

export async function DELETE(request: Request) {
    return proxyBotApi(request)
}

export async function PATCH(request: Request) {
    return proxyBotApi(request)
}
