/**
 * `/download` host check. Same urllib parse and decision as
 * `isAllowedYoutubeDownloadUrl`: exact YouTube hosts, including the rejection
 * of `consent.youtube.com`. A separate WHATWG parse allowed
 * `youtube.com\@consent.youtube.com` because Node reads the host before `\`.
 */
export { isAllowedYoutubeDownloadUrl as isAllowedYoutubeDownloadHostUrl } from "./youtubeDownloadUrl.js"
