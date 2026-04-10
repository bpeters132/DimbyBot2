import { proxyBotApi } from "@/server/bot-api-proxy"

/** Proxies to the bot process (`API_PROXY_TARGET`); do not import `src/botApi` here (Turbopack). */
export async function GET(request: Request) {
    return proxyBotApi(request)
}
