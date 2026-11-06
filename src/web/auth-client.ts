import { createAuthClient } from "better-auth/react"

/**
 * Dashboard Better Auth client.
 * `inferAdditionalFields<typeof auth>()` made `useSession().data` `never` on 1.7.7.
 */
export const authClient = createAuthClient()
