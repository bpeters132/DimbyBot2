import { inferAdditionalFields } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import type { auth } from "./auth.js"

/** Infer session/user from the Next.js auth instance so 1.6.22 `useSession().data` is not `never`. */
export const authClient = createAuthClient({
    plugins: [inferAdditionalFields<typeof auth>()],
})
