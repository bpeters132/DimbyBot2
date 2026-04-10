export interface ApiErrorPayload {
    error: string
    details?: string
}

export interface ApiSuccessPayload<T> {
    ok: true
    data: T
}

export interface ApiFailurePayload {
    ok: false
    error: ApiErrorPayload
}

export type ApiResponse<T> = ApiSuccessPayload<T> | ApiFailurePayload
