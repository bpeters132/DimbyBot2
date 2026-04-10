import { proxyBotApi } from "@/server/bot-api-proxy"

export async function DELETE(request: Request) {
    return proxyBotApi(request)
}

export async function PATCH(request: Request) {
    return proxyBotApi(request)
}
