import { proxyBotApi } from "@/server/bot-api-proxy"

export async function GET(request: Request) {
    return proxyBotApi(request)
}

export async function POST(request: Request) {
    return proxyBotApi(request)
}

export async function DELETE(request: Request) {
    return proxyBotApi(request)
}
