/**
 * `/download` redirect check. Same urllib parse and decision as
 * `isAllowedYoutubeDownloadUrl`. WHATWG turns `\` into `/`, so
 * `youtube.com\@youtube.com/redirect` used to look like a non-redirect path
 * while yt-dlp still requested `/redirect` and followed `q`.
 */
export {
    isAllowedYoutubeDownloadUrl,
    isAllowedYoutubeDownloadUrl as isAllowedYoutubeDownloadRedirectUrl,
} from "./youtubeDownloadUrl.js"
