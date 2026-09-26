/**
 * Env keys whose values are stripped from `/eval` output and error text before Discord replies.
 * Matches token/secret/password-style suffixes used across Discord, Better Auth, and API credentials.
 */
const SENSITIVE_EVAL_ENV_KEY =
    /(?:^|_)(PASS|PWD|PASSWORD|SECRET|TOKEN|CRED|CREDENTIAL|API|KEY|PRIVATE|ACCESS)(?:_|$)/i

/** True when an environment variable name looks like a credential (not `OWNER_ID` / `NODE_ENV`). */
export function isSensitiveEvalEnvKey(key: string): boolean {
    return SENSITIVE_EVAL_ENV_KEY.test(key)
}

/**
 * Builds the substring → placeholder map used to scrub `/eval` results.
 * The bot token is recorded first so an env var that duplicates it keeps `[REDACTED TOKEN]`.
 * Duplicate env values keep the first key's placeholder.
 */
export function collectEvalRedactionMap(
    token: string | null | undefined,
    env: NodeJS.Dict<string> = process.env
): Map<string, string> {
    const sensitive = new Map<string, string>()
    if (token && typeof token === "string") {
        sensitive.set(token, "[REDACTED TOKEN]")
    }
    for (const key in env) {
        if (!isSensitiveEvalEnvKey(key)) continue
        const value = env[key]
        if (value && typeof value === "string" && !sensitive.has(value)) {
            sensitive.set(value, `[REDACTED ENV: ${key}]`)
        }
    }
    return sensitive
}

/**
 * Replaces known secrets in eval output/errors. Longer values are applied first so a prefix
 * secret cannot partially overwrite a longer overlapping credential.
 */
export function redactEvalOutput(text: string, sensitive: ReadonlyMap<string, string>): string {
    let redacted = text
    const entries = [...sensitive.entries()].sort((a, b) => b[0].length - a[0].length)
    for (const [value, placeholder] of entries) {
        redacted = redacted.replaceAll(value, placeholder)
    }
    return redacted
}
