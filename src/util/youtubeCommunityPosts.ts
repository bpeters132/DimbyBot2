export type YoutubeCommunityPost = {
    postId: string
    title: string
    url: string
}

const POST_ID_RE = /"(?:postId|sharedPostId)"\s*:\s*"(Ug[A-Za-z0-9_-]+)"/g

/** Best-effort extract of community post ids from a channel posts/community HTML page. */
export function parseYoutubeCommunityPostsHtml(
    html: string,
    channelId: string
): YoutubeCommunityPost[] {
    const seen = new Set<string>()
    const posts: YoutubeCommunityPost[] = []
    let match: RegExpExecArray | null
    POST_ID_RE.lastIndex = 0
    while ((match = POST_ID_RE.exec(html))) {
        const postId = match[1]
        if (!postId || seen.has(postId)) continue
        seen.add(postId)
        posts.push({
            postId,
            title: "Community post",
            url: `https://www.youtube.com/channel/${channelId}/community`,
        })
    }
    return posts
}

export type CommunityFetch = (url: string) => Promise<{ ok: boolean; text: string }>

/**
 * Fetches a channel community/posts page and extracts post ids. Returns [] on any failure.
 * Community posts are not in PubSub or RSS.
 */
export async function fetchYoutubeCommunityPosts(
    channelId: string,
    fetchImpl: CommunityFetch
): Promise<YoutubeCommunityPost[]> {
    const urls = [
        `https://www.youtube.com/channel/${channelId}/posts`,
        `https://www.youtube.com/channel/${channelId}/community`,
    ]
    for (const url of urls) {
        try {
            const res = await fetchImpl(url)
            if (!res.ok) continue
            const posts = parseYoutubeCommunityPostsHtml(res.text, channelId)
            if (posts.length > 0) return posts
        } catch {
            // try the next URL
        }
    }
    return []
}

/** Seen-store key so community post ids cannot collide with video ids. */
export function communitySeenId(postId: string): string {
    return `community:${postId}`
}
