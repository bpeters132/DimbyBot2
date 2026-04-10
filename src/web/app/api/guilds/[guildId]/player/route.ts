/**
 * Forwards the browser’s cookies to the bot’s Express `/api/guilds/...` so the session is validated
 * on the bot. Keeps a stable HTTP proxy boundary (method/body/query) that server actions do not replace.
 */
import { proxyBotApi } from "@/server/bot-api-proxy"

export async function GET(request: Request) {
    return proxyBotApi(request)
}

export async function POST(request: Request) {
    return proxyBotApi(request)
}
