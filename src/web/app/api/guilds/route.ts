import { proxyBotApi } from "@/server/bot-api-proxy"

/**
 * `GET` must proxy to the external bot process via `proxyBotApi` and `API_PROXY_TARGET`; this Next
 * route cannot call a local server action or import `src/botApi` directly because Turbopack/runtime
 * boundaries keep the bot API in a separate long-running process.
 */
export async function GET(request: Request) {
    return proxyBotApi(request)
}
