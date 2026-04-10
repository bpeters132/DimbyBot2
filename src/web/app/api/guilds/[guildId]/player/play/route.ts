import { proxyBotApi } from "@/server/bot-api-proxy"

export async function POST(request: Request) {
    return proxyBotApi(request)
}
