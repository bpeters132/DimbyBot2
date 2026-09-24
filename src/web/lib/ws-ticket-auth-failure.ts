export type WsTicketAuthFailureKind = "missing_secret" | "unauthorized" | "auth_unavailable"

export type WsTicketAuthFailure = {
    status: 401 | 503
    body: {
        error: "Server misconfigured" | "Unauthorized" | "Auth service temporarily unavailable"
    }
}

/**
 * Maps `GET /api/ws-ticket` auth gates to HTTP status.
 * Missing `BETTER_AUTH_SECRET` and session-lookup throws are 503 so clients retry/alert instead of
 * sending the user to sign-in; a resolved session without a user id is 401.
 */
export function mapWsTicketAuthFailure(kind: WsTicketAuthFailureKind): WsTicketAuthFailure {
    switch (kind) {
        case "missing_secret":
            return { status: 503, body: { error: "Server misconfigured" } }
        case "unauthorized":
            return { status: 401, body: { error: "Unauthorized" } }
        case "auth_unavailable":
            return { status: 503, body: { error: "Auth service temporarily unavailable" } }
    }
}
