/** Escapes `\` and `"` so artist names are safe inside Lucene phrase queries. */
export function escapeLucenePhrase(s: string): string {
    return String(s || "")
        .trim()
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
}
