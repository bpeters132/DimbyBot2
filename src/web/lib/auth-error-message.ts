/** Maps Better Auth / OAuth error codes to user-facing copy (no credential prompts). */
export function authErrorMessage(code: string | undefined): string {
    const normalized = code?.trim().toLowerCase()
    switch (normalized) {
        case "please_restart_the_process":
            return "The sign-in session expired or was interrupted before Discord returned. Close other dashboard tabs, then try again from the home page."
        case "access_denied":
            return "Discord sign-in was cancelled."
        case "invalid_code":
        case "invalid_grant":
            return "Discord rejected the authorization code (it may have already been used). Try signing in again."
        case undefined:
        case "":
            return "Sign-in could not be completed."
        default:
            return "Sign-in could not be completed. Try again from the home page."
    }
}
