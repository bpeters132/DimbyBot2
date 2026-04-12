import { proxyBotApi } from "@/server/bot-api-proxy"

/**
 * Proxies to the bot process (`API_PROXY_TARGET`); do not import `src/botApi` here (Turbopack).
 * Session cookies and `Authorization` are forwarded as-is via {@link proxyBotApi}; the bot’s
 * `/api/guilds` handler performs authentication and permission checks.
 */
export async function GET(request: Request) {
    return proxyBotApi(request)
}
