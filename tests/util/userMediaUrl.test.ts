import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    isBlockedUserMediaUrl,
    isHttpUrlQuery,
    rawHttpUrlHostname,
    rewriteIcySchemeToHttp,
    trimmedHttpUrlQuery,
    unwrapDirectLinkSourcePrefix,
    unwrapLavalinkSourcePrefix,
} from "../../src/util/userMediaUrl.js"

describe("isHttpUrlQuery", () => {
    it("detects http(s) and icy prefixes", () => {
        assert.equal(isHttpUrlQuery("https://youtube.com/watch?v=dQw4w9WgXcQ"), true)
        assert.equal(isHttpUrlQuery("  http://open.spotify.com/track/abc  "), true)
        assert.equal(isHttpUrlQuery("HTTP://127.0.0.1/"), true)
        assert.equal(isHttpUrlQuery("icy://radio.example.com/stream"), true)
        assert.equal(isHttpUrlQuery("ICY://127.0.0.1/"), true)
        assert.equal(isHttpUrlQuery("never gonna give you up"), false)
        assert.equal(isHttpUrlQuery("ytsearch:rick astley"), false)
    })
})

describe("rewriteIcySchemeToHttp", () => {
    it("rewrites icy:// to http:// like lavaplayer getAsHttpReference", () => {
        assert.equal(rewriteIcySchemeToHttp("icy://postgres-db:5432/"), "http://postgres-db:5432/")
        assert.equal(rewriteIcySchemeToHttp("  ICY://127.0.0.1/  "), "http://127.0.0.1/")
        assert.equal(
            rewriteIcySchemeToHttp("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )
    })
})

describe("trimmedHttpUrlQuery", () => {
    it("returns the trimmed URL for whitespace-padded public catalog URLs", () => {
        assert.equal(
            trimmedHttpUrlQuery("  https://www.youtube.com/watch?v=dQw4w9WgXcQ  "),
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )
        assert.equal(trimmedHttpUrlQuery("never gonna give you up"), null)
        assert.equal(
            trimmedHttpUrlQuery("icy://radio.example.com/live"),
            "http://radio.example.com/live"
        )
    })
})

describe("unwrapLavalinkSourcePrefix", () => {
    it("strips link/uri and short search-source wrappers", () => {
        assert.equal(unwrapLavalinkSourcePrefix("link:http://127.0.0.1/"), "http://127.0.0.1/")
        assert.equal(unwrapLavalinkSourcePrefix("URI:http://postgres-db/"), "http://postgres-db/")
        assert.equal(unwrapLavalinkSourcePrefix("yt:http://10.0.0.5/"), "http://10.0.0.5/")
        assert.equal(
            unwrapLavalinkSourcePrefix("sc:http://169.254.169.254/"),
            "http://169.254.169.254/"
        )
        assert.equal(unwrapLavalinkSourcePrefix("local:http://127.0.0.1/"), "http://127.0.0.1/")
        assert.equal(
            unwrapLavalinkSourcePrefix("ytsearch:never gonna give you up"),
            "never gonna give you up"
        )
    })

    it("prefers longer prefixes over short aliases", () => {
        assert.equal(unwrapLavalinkSourcePrefix("ytsearch:http://127.0.0.1/"), "http://127.0.0.1/")
        assert.equal(unwrapLavalinkSourcePrefix("scsearch:http://10.0.0.1/"), "http://10.0.0.1/")
    })

    it("returns null when no wrapper is present", () => {
        assert.equal(unwrapLavalinkSourcePrefix("http://127.0.0.1/"), null)
        assert.equal(unwrapLavalinkSourcePrefix("never gonna give you up"), null)
    })
})

describe("isBlockedUserMediaUrl", () => {
    it("allows public catalog hosts", () => {
        assert.equal(isBlockedUserMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), false)
        assert.equal(isBlockedUserMediaUrl("https://youtu.be/dQw4w9WgXcQ"), false)
        assert.equal(isBlockedUserMediaUrl("https://open.spotify.com/track/abc"), false)
        assert.equal(isBlockedUserMediaUrl("https://soundcloud.com/artist/track"), false)
        assert.equal(isBlockedUserMediaUrl("never gonna give you up"), false)
        assert.equal(isBlockedUserMediaUrl("ytsearch:never gonna give you up"), false)
        assert.equal(
            isBlockedUserMediaUrl("link:https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            false
        )
    })

    it("rejects loopback, RFC1918, and link-local addresses", () => {
        assert.equal(isBlockedUserMediaUrl("http://127.0.0.1:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://127.0.0.1/"), true)
        assert.equal(isBlockedUserMediaUrl(" http://127.0.0.1:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost:3001/ws"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost./"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.localhost./"), true)
        assert.equal(isBlockedUserMediaUrl("http://10.0.0.5/"), true)
        assert.equal(isBlockedUserMediaUrl("http://192.168.1.10/audio.mp3"), true)
        assert.equal(isBlockedUserMediaUrl("http://172.16.0.2/"), true)
        assert.equal(isBlockedUserMediaUrl("http://169.254.1.1/"), true)
        assert.equal(isBlockedUserMediaUrl("http://0.0.0.0/"), true)
        assert.equal(isBlockedUserMediaUrl("http://[::]/"), true)
        assert.equal(isBlockedUserMediaUrl("http://[::1]/"), true)
        assert.equal(isBlockedUserMediaUrl("http://[::ffff:127.0.0.1]/"), true)
        // Hex-form IPv4-mapped addresses (::ffff:AABB:CCDD) are a common SSRF bypass shape.
        assert.equal(isBlockedUserMediaUrl("http://[::ffff:7f00:1]/"), true) // 127.0.0.1
        assert.equal(isBlockedUserMediaUrl("http://[::ffff:0a00:1]/"), true) // 10.0.0.1
        assert.equal(isBlockedUserMediaUrl("http://[::ffff:c0a8:1]/"), true) // 192.168.0.1
        assert.equal(isBlockedUserMediaUrl("http://[fd12:3456:789a:1::1]/"), true)
        assert.equal(isBlockedUserMediaUrl("http://[fe90::1]/"), true)
        assert.equal(isBlockedUserMediaUrl("http://[febf::1]/"), true) // still fe80::/10
    })

    it("rejects leading-zero IPv4 literals that WHATWG rewrites to a public host", () => {
        // Node URL hostname is octal (`010.0.0.1` → `8.0.0.1`); Java InetAddress is decimal
        // (`10.0.0.1`). player.search sends the original identifier to Lavalink/Lavaplayer.
        assert.equal(isBlockedUserMediaUrl("http://010.0.0.1:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://172.017.0.1/"), true)
        assert.equal(isBlockedUserMediaUrl("http://0172.017.0.1/"), true)
        assert.equal(isBlockedUserMediaUrl("http://user:pass@010.0.0.1:5432/secret"), true)
        assert.equal(isBlockedUserMediaUrl("http://010.0.0.1./"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://010.0.0.1/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://010.0.0.1/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://172.017.0.1/audio.mp3"), true)
        assert.equal(isBlockedUserMediaUrl("icy://010.0.0.1/stream"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://010.0.0.1:5432/"), true)
        // Public dotted-decimal (including WHATWG's rewritten form) must stay allowed.
        assert.equal(isBlockedUserMediaUrl("http://8.8.8.8/"), false)
        assert.equal(isBlockedUserMediaUrl("http://172.15.0.1/"), false)
        assert.equal(isBlockedUserMediaUrl("http://8.0.0.1/"), false)
    })

    it("rejects short leading-zero IPv4 that WHATWG rewrites to a public host", () => {
        // A.B / A.B.C: Node octal (`010.1` → `8.0.0.1`); Java decimal (`10.0.0.1`).
        // The 4-octet raw-host check misses these because they are not four labels.
        assert.equal(isBlockedUserMediaUrl("http://010.1/"), true)
        assert.equal(isBlockedUserMediaUrl("http://010.1:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://010.0.1/"), true)
        assert.equal(isBlockedUserMediaUrl("http://010.0.1:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://0172.16.1/"), true)
        assert.equal(isBlockedUserMediaUrl("http://0172.17.1/"), true)
        assert.equal(isBlockedUserMediaUrl("http://0127.1/"), true)
        assert.equal(isBlockedUserMediaUrl("http://0127.0.1/"), true)
        assert.equal(isBlockedUserMediaUrl("http://user:pass@010.1:5432/secret"), true)
        assert.equal(isBlockedUserMediaUrl("http://010.1./"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://010.1/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://010.1/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://0172.16.1/audio.mp3"), true)
        assert.equal(isBlockedUserMediaUrl("icy://010.1/stream"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://010.1:5432/"), true)
        // Public short-form / rewritten hosts stay allowed.
        assert.equal(isBlockedUserMediaUrl("http://8.1/"), false)
        assert.equal(isBlockedUserMediaUrl("http://8.0.1/"), false)
        assert.equal(isBlockedUserMediaUrl("http://8.0.0.1/"), false)
    })

    it("rejects Docker-internal single-label hosts", () => {
        assert.equal(isBlockedUserMediaUrl("http://postgres-db:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://lavalink:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://invidious-companion:8282/"), true)
        assert.equal(isBlockedUserMediaUrl("http://yt-cipher:8001/"), true)
    })

    it("rejects DNS-bounce hosts that resolve to private or loopback IPs", () => {
        assert.equal(isBlockedUserMediaUrl("http://10.0.0.1.nip.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://192.168.1.1.sslip.io/audio.mp3"), true)
        assert.equal(isBlockedUserMediaUrl("http://127.0.0.1.nip.io:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://169.254.169.254.nip.io/latest/meta-data/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localtest.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localtest.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localtest.org/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localtest.org:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localtest.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localtest.dev:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://10.0.0.1.localtest.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://lvh.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://vcap.me/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://10.0.0.5.NIP.IO/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.local.gd/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.local.gd:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.direct/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.direct:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.lcl.host/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.lcl.host:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://plex.direct/"), true)
        assert.equal(
            isBlockedUserMediaUrl(
                "http://10-0-0-1.0123456789abcdef0123456789abcdef.plex.direct:5432/"
            ),
            true
        )
        assert.equal(isBlockedUserMediaUrl("link:http://foo.local.gd/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.localhost.direct/"), true)
        assert.equal(isBlockedUserMediaUrl("http://yoogle.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.yoogle.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.tv/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localhost.tv:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhst.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhst.dev:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://yoogle.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.localhost.tv/"), true)
        // nar0.com: wildcard loopback, dash-IP, and hex-IP encoder
        assert.equal(isBlockedUserMediaUrl("http://foo.nar0.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.nar0.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://10-0-0-1.nar0.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.10-0-0-1.nar0.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://127-0-0-1.nar0.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://192-168-0-1.nar0.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://172-16-0-2.nar0.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://169-254-169-254.nar0.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://0a000001.nar0.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://7f000001.nar0.com/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.nar0.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.nar0.com/"), true)
        // 127001.it: wildcard loopback (apex/www are public; suffix deny matches localhost.tv)
        assert.equal(isBlockedUserMediaUrl("http://foo.127001.it/"), true)
        assert.equal(isBlockedUserMediaUrl("http://admin.127001.it:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.127001.it/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.127001.it/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.127001.it/"), true)
        // Apex-only public DNS loopback sink (GoDaddy unused apex); wildcard is empty
        assert.equal(isBlockedUserMediaUrl("http://domaincontrol.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://domaincontrol.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://DOMAINCONTROL.COM/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://domaincontrol.com:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://domaincontrol.com/"), true)
        // anyip.dev dash-IP encoder (dotted 10.0.0.1.anyip.dev already caught by label embed)
        assert.equal(isBlockedUserMediaUrl("http://10-0-0-1.anyip.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://127-0-0-1.anyip.dev:5432/"), true)
        assert.equal(
            isBlockedUserMediaUrl("http://169-254-169-254.anyip.dev/latest/meta-data/"),
            true
        )
        assert.equal(isBlockedUserMediaUrl("http://myapp-10-0-0-1.anyip.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://preview.127-0-0-1.anyip.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://10-0-0-1.anyip.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://127-0-0-1.anyip.dev/"), true)
        // Apex/www public DNS loopback; wildcard foo.localhost.cloud is a public parking IP
        assert.equal(isBlockedUserMediaUrl("http://localhost.cloud/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.cloud:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localhost.cloud/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALHOST.CLOUD/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.cloud:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.cloud/"), true)
        // Apex/www/wildcard public DNS loopback (distinct from denied localh.st)
        assert.equal(isBlockedUserMediaUrl("http://localh.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localh.net:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localh.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localh.net/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALH.NET/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localh.net:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localh.net/"), true)
        // Embedded blocked IPv4 labels even under an unfamiliar suffix
        assert.equal(isBlockedUserMediaUrl("http://172.16.0.2.attacker.example/"), true)
        // traefik.me / localho.st: public bounce services omitted from the original suffix list.
        // Dash-octet form (`10-0-0-1.traefik.me` → 10.0.0.1) is not four decimal DNS labels.
        assert.equal(isBlockedUserMediaUrl("http://traefik.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.traefik.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://10-0-0-1.traefik.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://10-0-0-1.traefik.me:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://192-168-0-1.traefik.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://172-16-0-2.traefik.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://127-0-0-1.traefik.me/"), true)
        assert.equal(
            isBlockedUserMediaUrl("http://169-254-169-254.traefik.me/latest/meta-data/"),
            true
        )
        assert.equal(isBlockedUserMediaUrl("http://localho.st/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localho.st/"), true)
        // Dash-encoded blocked IPv4 on an unfamiliar suffix (same encoding sslip/traefik use)
        assert.equal(isBlockedUserMediaUrl("http://10-0-0-1.attacker.example/"), true)
        assert.equal(isBlockedUserMediaUrl("http://192-168-1-10.attacker.example/audio.mp3"), true)
        assert.equal(isBlockedUserMediaUrl("http://8-8-8-8.attacker.example/"), false)
        // Loopback-only bounce aliases omitted from the original suffix list.
        assert.equal(isBlockedUserMediaUrl("http://lacolhost.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.lacolhost.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.lacolhost.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localh.st/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localh.st:2333/"), true)
        // 1u.ms `make-{ip}-rr` encodes RFC1918 / loopback inside a longer hyphen label.
        assert.equal(isBlockedUserMediaUrl("http://make-127-0-0-1-rr.1u.ms/"), true)
        assert.equal(isBlockedUserMediaUrl("http://make-10-0-0-1-rr.1u.ms:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://make-192-168-0-1-rr.1u.ms/"), true)
        assert.equal(isBlockedUserMediaUrl("http://make-172-16-0-2-rr.1u.ms/"), true)
        assert.equal(
            isBlockedUserMediaUrl("http://make-169-254-169-254-rr.1u.ms/latest/meta-data/"),
            true
        )
        // Same wrapping on an unfamiliar suffix (consecutive hyphen octets, not a 4-part label).
        assert.equal(isBlockedUserMediaUrl("http://make-10-0-0-1-rr.attacker.example/"), true)
        assert.equal(isBlockedUserMediaUrl("http://make-8-8-8-8-rr.attacker.example/"), false)
        // qip.sh: localhost zone, dash-IP, and compact qip-notation (not four dotted labels)
        assert.equal(isBlockedUserMediaUrl("http://i.qip.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.i.qip.sh:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://10-0-0-1.qip.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("http://127-0-0-1.qip.sh:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://192-168-0-1.qip.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("http://172-16-0-2.qip.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("http://169-254-169-254.qip.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("http://zozizs.x.qip.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app-zozizs.x.qip.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("http://aobo.v.qip.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://i.qip.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.i.qip.sh/"), true)
        // Public loopback aliases (apex/subdomain) that do not embed dotted IPv4 labels
        assert.equal(isBlockedUserMediaUrl("http://localhst.co.uk/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhst.co.uk:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://local.sisteminha.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.local.sisteminha.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://fbi.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.fbi.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mouse-potato.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.mouse-potato.com/"), true)
        // Apex sisteminha.com is a public site; only local.sisteminha.com is the bounce zone
        assert.equal(isBlockedUserMediaUrl("http://sisteminha.com/"), false)
        // rbndr.us: public hex-IP bounce (taviso). Apex has no public A record.
        assert.equal(isBlockedUserMediaUrl("http://rbndr.us/"), true)
        assert.equal(isBlockedUserMediaUrl("http://7f000001.c0a80001.rbndr.us/"), true)
        assert.equal(isBlockedUserMediaUrl("http://0a000001.c0a80001.rbndr.us:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://a9fea9fe.08080808.rbndr.us/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://0a000001.c0a80001.rbndr.us:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://7f000001.c0a80001.rbndr.us/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://0a000001.c0a80001.rbndr.us/"), true)
        // Hex-label embed under an unfamiliar suffix (same encoder class as rbndr.us)
        assert.equal(isBlockedUserMediaUrl("http://0a000001.attacker.example/"), true)
        assert.equal(isBlockedUserMediaUrl("http://7f000001.attacker.example/"), true)
        assert.equal(isBlockedUserMediaUrl("http://c0a80001.attacker.example/"), true)
        assert.equal(isBlockedUserMediaUrl("http://a9fea9fe.attacker.example/"), true)
        // Public hex IPv4 8.8.8.8 must stay allowed
        assert.equal(isBlockedUserMediaUrl("http://08080808.attacker.example/"), false)
        // lndo.site: Lando public wildcard loopback (apex is a public AWS site)
        assert.equal(isBlockedUserMediaUrl("http://app.lndo.site/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.lndo.site:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.lndo.site/"), true)
        assert.equal(isBlockedUserMediaUrl("http://lndo.site/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://APP.LNDO.SITE/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://app.lndo.site:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.lndo.site/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://app.lndo.site/"), true)
        // backname.io IPv6 dash (`--` → `::`) is not four hyphen octets
        assert.equal(isBlockedUserMediaUrl("http://0--1.backname.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://0--ffff-a00-1.backname.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://0--ffff-7f00-1.backname.io:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://fc00--1.backname.io/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://0--ffff-a00-1.backname.io/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://0--1.backname.io/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://0--ffff-a00-1.backname.io/"), true)
        // Same IPv6 dash encoder under an unfamiliar suffix
        assert.equal(isBlockedUserMediaUrl("http://0--1.attacker.example/"), true)
        assert.equal(isBlockedUserMediaUrl("http://0--ffff-a00-1.attacker.example/"), true)
        assert.equal(isBlockedUserMediaUrl("http://0--ffff-7f00-1.attacker.example/"), true)
        assert.equal(isBlockedUserMediaUrl("http://fc00--1.attacker.example/"), true)
        assert.equal(isBlockedUserMediaUrl("http://fd12-3456-789a-1--1.attacker.example/"), true)
        assert.equal(isBlockedUserMediaUrl("http://fe80--1.attacker.example/"), true)
        // GCP IMDS hostname (A 169.254.169.254); not IP-in-name
        assert.equal(isBlockedUserMediaUrl("http://metadata.goog/"), true)
        assert.equal(isBlockedUserMediaUrl("https://metadata.goog/computeMetadata/v1/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://metadata.goog/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://metadata.goog/"), true)
        assert.equal(isBlockedUserMediaUrl("http://metadata.google.internal/"), true)
        // ddev.site: DDEV public wildcard loopback (apex has no A)
        assert.equal(isBlockedUserMediaUrl("http://foo.ddev.site/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.ddev.site:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.ddev.site/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.ddev.site/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://FOO.DDEV.SITE/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.ddev.site:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.ddev.site/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.ddev.site/"), true)
        // docksal.site: Docksal public wildcard RFC1918 (apex is a public site)
        assert.equal(isBlockedUserMediaUrl("http://foo.docksal.site/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.docksal.site:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://anything.docksal.site/"), true)
        assert.equal(isBlockedUserMediaUrl("http://docksal.site/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.docksal.site/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.docksal.site/"), true)
        // docker.amazee.io: Lagoon/Pygmy public loopback zone (amazee.io stays public)
        assert.equal(isBlockedUserMediaUrl("http://foo.docker.amazee.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://docker.amazee.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://myapp.docker.amazee.io:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.docker.amazee.io/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://docker.amazee.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://amazee.io/"), false)
        // lagoon.cloud: Lagoon public wildcard RFC1918 (apex has no A)
        assert.equal(isBlockedUserMediaUrl("http://foo.lagoon.cloud/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.lagoon.cloud/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.lagoon.cloud:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.us.lagoon.cloud/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.lagoon.cloud/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://app.lagoon.cloud/"), true)
        // sslip compact IPv4-mapped: `ffff-` + 8 hex (not a standalone hex label)
        assert.equal(isBlockedUserMediaUrl("http://ffff-0a000001.my.local-ip.co/"), true)
        assert.equal(isBlockedUserMediaUrl("http://ffff-7f000001.my.local-ip.co:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://ffff-c0a80001.my.local-ip.co/"), true)
        assert.equal(isBlockedUserMediaUrl("http://ffff-a9fea9fe.my.local-ip.co/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://ffff-0a000001.my.local-ip.co/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://ffff-0a000001.my.local-ip.co/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://ffff-0a000001.my.local-ip.co/"), true)
        // Same encoder under an unfamiliar suffix
        assert.equal(isBlockedUserMediaUrl("http://ffff-0a000001.attacker.example/"), true)
        assert.equal(isBlockedUserMediaUrl("http://ffff-7f000001.attacker.example/"), true)
        assert.equal(isBlockedUserMediaUrl("http://ffff-c0a80001.attacker.example/"), true)
        assert.equal(isBlockedUserMediaUrl("http://ffff-a9fea9fe.attacker.example/"), true)
        // Public compact-mapped 8.8.8.8 must stay allowed
        assert.equal(isBlockedUserMediaUrl("http://ffff-08080808.attacker.example/"), false)
        // BrowserStack Local: documented localhost alias (apex → 127.0.0.1 on public DNS).
        // Wildcards under bs-local.com are empty today; suffix deny still covers them.
        assert.equal(isBlockedUserMediaUrl("http://bs-local.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bs-local.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.bs-local.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.bs-local.com:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://BS-LOCAL.COM/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://bs-local.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://bs-local.com/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://bs-local.com/"), true)

        // backloop.dev: public wildcard loopback. Apex is a public website
        // (suffix-deny tradeoff like localhost.tv).
        assert.equal(isBlockedUserMediaUrl("http://foo.backloop.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.backloop.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.backloop.dev:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.backloop.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://backloop.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://FOO.BACKLOOP.DEV/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.backloop.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.backloop.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.backloop.dev/"), true)
        // devlocal.me: public wildcard loopback (apex has no A; www/foo/app → 127.0.0.1)
        assert.equal(isBlockedUserMediaUrl("http://foo.devlocal.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.devlocal.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.devlocal.me:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.devlocal.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.devlocal.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.devlocal.me/"), true)
        assert.equal(isBlockedUserMediaUrl("http://devlocal.me/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.devlocal.me:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://www.devlocal.me/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.devlocal.me/"), true)
        // lhst.net: public wildcard RFC1918 bounce (apex/www/foo → 192.168.10.128).
        // Distinct from denied localh.net / localh.st / localhst.dev.
        assert.equal(isBlockedUserMediaUrl("http://lhst.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://lhst.net:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.lhst.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.lhst.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.lhst.net:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LHST.NET/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://lhst.net/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://foo.lhst.net/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://lhst.net/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://lhst.net/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://lhst.net/"), true)
        // Sibling public wildcard loopback zones, distinct from denied `devlocal.me`.
        // `devlocal.dev` / `devlocal.io` / `devlocal.us` / `devlocal.site`: apex + wildcards
        // → 127.0.0.1. `devlocal.net` wildcards → 127.0.0.1; apex/www are public parking.
        assert.equal(isBlockedUserMediaUrl("http://foo.devlocal.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.devlocal.net:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.devlocal.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://admin.devlocal.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.devlocal.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.devlocal.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://devlocal.net/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.devlocal.net:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://app.devlocal.net/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.devlocal.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://devlocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.devlocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.devlocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.devlocal.dev:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://FOO.DEVLOCAL.DEV/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://devlocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.devlocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.devlocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://devlocal.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.devlocal.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.devlocal.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.devlocal.io:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.devlocal.io/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://devlocal.io/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.devlocal.io/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.devlocal.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://devlocal.us/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.devlocal.us/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.devlocal.us:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.devlocal.us/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.devlocal.us/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://devlocal.us/"), true)
        assert.equal(isBlockedUserMediaUrl("http://devlocal.site/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.devlocal.site/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.devlocal.site/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.devlocal.site:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.devlocal.site/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.devlocal.site/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://devlocal.site/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://foo.devlocal.net/"), true)
        // localdev.xyz: public wildcard loopback (apex/www/foo → 127.0.0.1). Distinct from
        // denied localdev.me and remaining sibling zones of the reserved `devlocal.*` names.
        assert.equal(isBlockedUserMediaUrl("http://localdev.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localdev.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localdev.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localdev.xyz:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.localdev.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("http://admin.localdev.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.localdev.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.localdev.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALDEV.XYZ/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localdev.xyz:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localdev.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.localdev.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.localdev.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localdev.xyz/"), true)
        // localh.online: public wildcard loopback. Distinct from denied localh.net / localh.st.
        assert.equal(isBlockedUserMediaUrl("http://localh.online/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localh.online/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localh.online/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localh.online:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.localh.online/"), true)
        assert.equal(isBlockedUserMediaUrl("http://admin.localh.online/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.localh.online/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.localh.online/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALH.ONLINE/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localh.online:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localh.online/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.localh.online/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.localh.online/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localh.online/"), true)
        // lvh.app: public wildcard loopback sibling of denied lvh.me.
        assert.equal(isBlockedUserMediaUrl("http://lvh.app/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.lvh.app/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.lvh.app/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.lvh.app:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.lvh.app/"), true)
        assert.equal(isBlockedUserMediaUrl("http://admin.lvh.app/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.lvh.app/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.lvh.app/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LVH.APP/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.lvh.app:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://lvh.app/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.lvh.app/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.lvh.app/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://lvh.app/"), true)
        // Charles Proxy: documented localhost alias (apex + unlabeled wildcards → 127.0.0.1).
        // Do not deny charlesproxy.com (public site; suffix-deny tradeoff like localhost.tv).
        assert.equal(isBlockedUserMediaUrl("http://localhost.charlesproxy.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.charlesproxy.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.charlesproxy.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localhost.charlesproxy.com:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://ssl.localhost.charlesproxy.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.localhost.charlesproxy.com/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALHOST.CHARLESPROXY.COM/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.charlesproxy.com/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://foo.localhost.charlesproxy.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.charlesproxy.com/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.charlesproxy.com/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.charlesproxy.com/"), true)
        // Charles short domain + Proxyman / Requestly apex localhost aliases.
        assert.equal(isBlockedUserMediaUrl("http://localhost.chls.pro/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.chls.pro:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.chls.pro/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.chls.pro/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.chls.pro/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.proxyman.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.proxyman.io:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.proxyman.io/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.proxyman.io/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.proxyman.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.requestly.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.requestly.io:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.requestly.io/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.requestly.io/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.requestly.io/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.requestly.io/"), true)
        // localhost.tv.com: sibling of denied localhost.tv; apex → 127.0.0.1 (wildcards empty).
        assert.equal(isBlockedUserMediaUrl("http://localhost.tv.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.tv.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.tv.com/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALHOST.TV.COM/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.tv.com/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localhost.tv.com:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.tv.com/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.tv.com/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.tv.com/"), true)
        // localhost.proxyman.com: Proxyman .com localhost alias (do not deny proxyman.com).
        assert.equal(isBlockedUserMediaUrl("http://localhost.proxyman.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.proxyman.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.proxyman.com/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALHOST.PROXYMAN.COM/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.proxyman.com/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localhost.proxyman.com:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.proxyman.com/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.proxyman.com/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.proxyman.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://proxyman.com/"), false)
        // localdev.tech: sibling of localdev.xyz; public wildcard loopback.
        assert.equal(isBlockedUserMediaUrl("http://localdev.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localdev.tech:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localdev.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localdev.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localdev.tech:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.localdev.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("http://admin.localdev.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.localdev.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.localdev.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://FOO.LOCALDEV.TECH/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localdev.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localdev.tech:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://www.localdev.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.localdev.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localdev.tech/"), true)
        // localhost.yaak.app: Yaak localhost alias; apex → 127.0.0.1 (wildcards empty).
        assert.equal(isBlockedUserMediaUrl("http://localhost.yaak.app/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.yaak.app:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.yaak.app/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALHOST.YAAK.APP/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.yaak.app/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localhost.yaak.app:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.yaak.app/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.yaak.app/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.yaak.app/"), true)
        assert.equal(isBlockedUserMediaUrl("http://yaak.app/"), false)
        // localhost.usebruno.com: Bruno localhost alias; apex → 127.0.0.1 (wildcards empty).
        assert.equal(isBlockedUserMediaUrl("http://localhost.usebruno.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.usebruno.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.usebruno.com/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALHOST.USEBRUNO.COM/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.usebruno.com/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localhost.usebruno.com:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.usebruno.com/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.usebruno.com/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.usebruno.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://usebruno.com/"), false)
        // localdev.cc: sibling of localdev.xyz / localdev.tech; public wildcard RFC1918 10.0.64.4.
        assert.equal(isBlockedUserMediaUrl("http://localdev.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localdev.cc:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localdev.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localdev.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localdev.cc:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.localdev.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://admin.localdev.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.localdev.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.localdev.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://FOO.LOCALDEV.CC/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localdev.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localdev.cc:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://www.localdev.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.localdev.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localdev.cc/"), true)
        // localdev.space: sibling public wildcard loopback of localdev.xyz / .tech / .cc
        assert.equal(isBlockedUserMediaUrl("http://localdev.space/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localdev.space:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localdev.space/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localdev.space/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localdev.space:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.localdev.space/"), true)
        assert.equal(isBlockedUserMediaUrl("http://admin.localdev.space/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.localdev.space/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.localdev.space/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALDEV.SPACE/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localdev.space/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localdev.space/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localdev.space/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localdev.space/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://foo.localdev.space/"), true)
        // HTTP Toolkit localhost alias. Apex httptoolkit.tech is a public site.
        assert.equal(isBlockedUserMediaUrl("http://local.httptoolkit.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("http://local.httptoolkit.tech:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.local.httptoolkit.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCAL.HTTPTOOLKIT.TECH/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://local.httptoolkit.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://local.httptoolkit.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://local.httptoolkit.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://local.httptoolkit.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://local.httptoolkit.tech/"), true)
        assert.equal(isBlockedUserMediaUrl("http://httptoolkit.tech/"), false)
        assert.equal(isBlockedUserMediaUrl("http://www.httptoolkit.tech/"), false)
        // LocalStack localhost alias. Apex/docs localstack.cloud stay public.
        assert.equal(isBlockedUserMediaUrl("http://localhost.localstack.cloud/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.localstack.cloud:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.localstack.cloud/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localhost.localstack.cloud/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALHOST.LOCALSTACK.CLOUD/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.localstack.cloud/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localhost.localstack.cloud/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.localstack.cloud/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.localstack.cloud/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.localstack.cloud/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localstack.cloud/"), false)
        assert.equal(isBlockedUserMediaUrl("http://www.localstack.cloud/"), false)
        assert.equal(isBlockedUserMediaUrl("http://docs.localstack.cloud/"), false)
        // localdev.pw: public wildcard loopback (apex/www/foo → 127.0.0.1).
        // Sibling of open PRs #313/#320/#323/#325 localdev.xyz/tech/cc/space.
        assert.equal(isBlockedUserMediaUrl("http://localdev.pw/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localdev.pw:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localdev.pw/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localdev.pw/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localdev.pw:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.localdev.pw/"), true)
        assert.equal(isBlockedUserMediaUrl("http://admin.localdev.pw/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.localdev.pw/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.localdev.pw/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://FOO.LOCALDEV.PW/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localdev.pw:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localdev.pw/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.localdev.pw/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.localdev.pw/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localdev.pw/"), true)
        // localdev.top: unlabeled wildcards → 127.0.0.1 (apex has no A).
        assert.equal(isBlockedUserMediaUrl("http://foo.localdev.top/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localdev.top/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localdev.top:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.localdev.top/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.localdev.top/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.localdev.top/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localdev.top/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localdev.top:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://www.localdev.top/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.localdev.top/"), true)
        // localdev.pl: apex + unlabeled wildcards → 127.0.0.1.
        assert.equal(isBlockedUserMediaUrl("http://localdev.pl/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localdev.pl/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localdev.pl:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localdev.pl/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localdev.pl/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localdev.pl/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.localdev.pl/"), true)
        // localdev.hu: unlabeled wildcards → 127.0.0.1 (apex is public Cloudflare;
        // suffix-deny tradeoff like localhost.tv).
        assert.equal(isBlockedUserMediaUrl("http://foo.localdev.hu/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localdev.hu/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localdev.hu:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.localdev.hu/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localdev.hu/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localdev.hu/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://www.localdev.hu/"), true)
        // localdev.it: unlabeled wildcards → 127.0.0.1 (apex/www public GitHub Pages;
        // suffix-deny tradeoff like docksal.site).
        assert.equal(isBlockedUserMediaUrl("http://foo.localdev.it/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localdev.it:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.localdev.it/"), true)
        assert.equal(isBlockedUserMediaUrl("http://admin.localdev.it/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.localdev.it/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.localdev.it/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localdev.it/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localdev.it/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.localdev.it/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.localdev.it/"), true)
        // localdev.co.uk: unlabeled wildcards → 127.0.0.1 (apex has no A).
        assert.equal(isBlockedUserMediaUrl("http://foo.localdev.co.uk/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localdev.co.uk/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localdev.co.uk:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.localdev.co.uk/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.localdev.co.uk/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.localdev.co.uk/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localdev.co.uk/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localdev.co.uk/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://www.localdev.co.uk/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.localdev.co.uk/"), true)
        // localtest.top: sibling of denied localtest.me/org/dev (apex+wildcards → 127.0.0.1).
        assert.equal(isBlockedUserMediaUrl("http://localtest.top/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localtest.top/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localtest.top:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localtest.top/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.localtest.top/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localtest.top/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localtest.top/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localtest.top/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.localtest.top/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localtest.top/"), true)
        // localdev.name: apex-only RFC1918 sink (172.31.254.1); wildcards empty today.
        assert.equal(isBlockedUserMediaUrl("http://localdev.name/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localdev.name:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localdev.name/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALDEV.NAME/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localdev.name:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localdev.name/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localdev.name/"), true)
        // localhost.fastly.net: Fastly localhost alias (apex → 127.0.0.1; wildcards empty).
        // Do not deny public fastly.net.
        assert.equal(isBlockedUserMediaUrl("http://localhost.fastly.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.fastly.net:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.fastly.net/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.fastly.net/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localhost.fastly.net/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.fastly.net/stream"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.fastly.net/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.fastly.net/"), true)
        // localhost.wiremock.io: WireMock Cloud localhost alias (apex → 127.0.0.1).
        // Do not deny public wiremock.io.
        assert.equal(isBlockedUserMediaUrl("http://localhost.wiremock.io/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.wiremock.io:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.wiremock.io/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.wiremock.io/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.wiremock.io/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.wiremock.io/"), true)
        // localhost.katalon.com: Katalon RFC1918 catch-all (apex/foo/www/app → 10.50.x).
        // Do not deny public katalon.com / www.katalon.com.
        assert.equal(isBlockedUserMediaUrl("http://localhost.katalon.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.katalon.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localhost.katalon.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localhost.katalon.com/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.katalon.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.localhost.katalon.com/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.katalon.com/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.katalon.com/"), true)
        // islocal.dev: public wildcard RFC1918 (apex/www/foo/app/api/admin → 192.168.10.3).
        assert.equal(isBlockedUserMediaUrl("http://islocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.islocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.islocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.islocal.dev:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://api.islocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://admin.islocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.islocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://islocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://islocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.islocal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://islocal.dev/"), true)
        // localh.de: sibling of denied localh.net / localh.st. Apex/foo/app → 192.168.0.1.
        assert.equal(isBlockedUserMediaUrl("http://localh.de/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localh.de/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localh.de:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://admin.localh.de/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localh.de/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localh.de/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localh.de/"), true)
        // vcap.cc: sibling of denied vcap.me. Apex + unlabeled wildcards → 127.0.0.1.
        assert.equal(isBlockedUserMediaUrl("http://vcap.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.vcap.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.vcap.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.vcap.cc:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.vcap.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.vcap.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://vcap.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://vcap.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://vcap.cc/"), true)
        // localhost.sg: apex-only public DNS loopback (wildcards empty today).
        assert.equal(isBlockedUserMediaUrl("http://localhost.sg/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.sg:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.sg/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.sg/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.sg/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.sg/"), true)
        // localtest.cz: sibling of denied localtest.me / .org / .dev. Apex/www/foo → 127.0.0.1.
        assert.equal(isBlockedUserMediaUrl("http://localtest.cz/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localtest.cz/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localtest.cz:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localtest.cz/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localtest.cz/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localtest.cz/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localtest.cz/"), true)
        // devlocal.nl: sibling of denied devlocal.me. Apex/www → 127.0.0.1.
        assert.equal(isBlockedUserMediaUrl("http://devlocal.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.devlocal.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.devlocal.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://devlocal.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://www.devlocal.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://devlocal.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://devlocal.nl/"), true)
        // 127001.info: sibling of denied 127001.it (apex → 127.0.0.1; wildcards empty).
        assert.equal(isBlockedUserMediaUrl("http://127001.info/"), true)
        assert.equal(isBlockedUserMediaUrl("http://127001.info:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.127001.info/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://127001.info/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://127001.info/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://127001.info/stream"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://127001.info/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://127001.info/"), true)
        // 127001.cz: sibling of denied 127001.it (apex → 192.168.2.14 RFC1918).
        assert.equal(isBlockedUserMediaUrl("http://127001.cz/"), true)
        assert.equal(isBlockedUserMediaUrl("http://127001.cz:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.127001.cz/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://127001.cz/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://127001.cz/"), true)
        // 127001.in: sibling of denied 127001.it (unlabeled wildcards → 127.0.0.1/::1).
        assert.equal(isBlockedUserMediaUrl("http://foo.127001.in/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.127001.in/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.127001.in:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.127001.in/"), true)
        assert.equal(isBlockedUserMediaUrl("http://127001.in/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.127001.in/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.127001.in/"), true)
        // docksal.dev: sibling of denied docksal.site (wildcards → 192.168.64.100;
        // apex is public Cloudflare; suffix-deny tradeoff like docksal.site).
        assert.equal(isBlockedUserMediaUrl("http://foo.docksal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.docksal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.docksal.dev:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://docksal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.docksal.dev/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.docksal.dev/"), true)
        // islocal.eu: sibling of islocal.dev (apex+wildcards → 192.168.0.3).
        assert.equal(isBlockedUserMediaUrl("http://islocal.eu/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.islocal.eu/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.islocal.eu:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.islocal.eu/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://islocal.eu/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.islocal.eu/"), true)
        // islocal.nl: sibling of islocal.dev (apex+wildcards → 10.11.11.107).
        assert.equal(isBlockedUserMediaUrl("http://islocal.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.islocal.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.islocal.nl:80/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.islocal.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://islocal.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.islocal.nl/"), true)
        // lvh.sh: sibling of denied lvh.me (apex+wildcards → 127.0.0.1).
        assert.equal(isBlockedUserMediaUrl("http://lvh.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.lvh.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.lvh.sh:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.lvh.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://FOO.LVH.SH/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.lvh.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://lvh.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.lvh.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.lvh.sh/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://lvh.sh/"), true)
        // localhost.tw: sibling of localhost.sg (apex+wildcards → 127.0.0.1/::1).
        assert.equal(isBlockedUserMediaUrl("http://localhost.tw/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.tw/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localhost.tw:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.tw/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.localhost.tw/"), true)
        // localhost.so: sibling of localhost.sg (unlabeled wildcards → 127.0.0.1; apex empty).
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.so/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localhost.so/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localhost.so:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.so/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localhost.so/"), true)
        // localhost.archive.org: Internet Archive unused localhost alias.
        // Do not deny public archive.org.
        assert.equal(isBlockedUserMediaUrl("http://localhost.archive.org/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.archive.org/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localhost.archive.org:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.localhost.archive.org/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.archive.org/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://foo.localhost.archive.org/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.archive.org/stream"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.archive.org/"), true)
        assert.equal(isBlockedUserMediaUrl("https://archive.org/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.archive.org/"), false)
        // localhost.newrelic.com: New Relic unused localhost alias.
        // Do not deny public newrelic.com.
        assert.equal(isBlockedUserMediaUrl("http://localhost.newrelic.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.newrelic.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localhost.newrelic.com:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.newrelic.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.localhost.newrelic.com/"), true)
        assert.equal(isBlockedUserMediaUrl("https://newrelic.com/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.newrelic.com/"), false)
        // localhost.lambdatest.com: LambdaTest localhost alias (apex → 127.0.0.1).
        // Do not deny public lambdatest.com.
        assert.equal(isBlockedUserMediaUrl("http://localhost.lambdatest.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.lambdatest.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.lambdatest.com/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.lambdatest.com/"), true)
        assert.equal(isBlockedUserMediaUrl("https://lambdatest.com/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.lambdatest.com/"), false)
        // localhost.rubyonrails.org: unused Rails localhost alias (apex → 127.0.0.1).
        // Do not deny public rubyonrails.org.
        assert.equal(isBlockedUserMediaUrl("http://localhost.rubyonrails.org/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.rubyonrails.org/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.rubyonrails.org/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.rubyonrails.org/"), true)
        assert.equal(isBlockedUserMediaUrl("https://rubyonrails.org/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.rubyonrails.org/"), false)
        // local.cl: first-level unlabeled wildcards → 127.0.0.1 (apex parking on 8.8.8.8).
        assert.equal(isBlockedUserMediaUrl("http://foo.local.cl/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.local.cl/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.local.cl:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://local.cl/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.local.cl/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.local.cl/"), true)
        // host.sk: public wildcard loopback (apex has no A; www/foo/app → 127.0.0.1).
        assert.equal(isBlockedUserMediaUrl("http://foo.host.sk/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.host.sk/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.host.sk:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.host.sk/"), true)
        assert.equal(isBlockedUserMediaUrl("http://host.sk/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.host.sk/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://www.host.sk/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.host.sk/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.host.sk/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://host.sk/"), true)
        // anyip.cc: sibling of denied anyip.dev (apex + unlabeled wildcards → 127.0.0.1).
        // app/api are public Azure; suffix-deny tradeoff like docksal.site.
        assert.equal(isBlockedUserMediaUrl("http://anyip.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.anyip.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.anyip.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://admin.anyip.cc:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://mysite.anyip.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.anyip.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.anyip.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://FOO.ANYIP.CC/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.anyip.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://anyip.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.anyip.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.anyip.cc/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://anyip.cc/"), true)
        // HostGator unused localhost alias. Do not deny public hostgator.com.
        assert.equal(isBlockedUserMediaUrl("http://localhost.hostgator.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.hostgator.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.hostgator.com/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.hostgator.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.hostgator.com/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.hostgator.com/"), true)
        assert.equal(isBlockedUserMediaUrl("https://hostgator.com/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.hostgator.com/"), false)
        // DreamHost unused localhost alias. Do not deny public dreamhost.com.
        assert.equal(isBlockedUserMediaUrl("http://localhost.dreamhost.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.dreamhost.com:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.dreamhost.com/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.dreamhost.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.dreamhost.com/"), true)
        assert.equal(isBlockedUserMediaUrl("https://dreamhost.com/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.dreamhost.com/"), false)
        // localhost.host.net unused alias. Do not deny public host.net.
        assert.equal(isBlockedUserMediaUrl("http://localhost.host.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.host.net:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.host.net/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.host.net/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localhost.host.net/"), true)
        assert.equal(isBlockedUserMediaUrl("https://host.net/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.host.net/"), false)
        // localhost.host.co.in unused alias. Do not deny public host.co.in.
        assert.equal(isBlockedUserMediaUrl("http://localhost.host.co.in/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.host.co.in/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.host.co.in/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.host.co.in/"), true)
        assert.equal(isBlockedUserMediaUrl("https://host.co.in/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.host.co.in/"), false)
        // localhost.host.ca unused alias. Do not deny public host.ca.
        assert.equal(isBlockedUserMediaUrl("http://localhost.host.ca/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.host.ca/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.host.ca/"), true)
        assert.equal(isBlockedUserMediaUrl("https://host.ca/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.host.ca/"), false)
        // localhost.host.jp unused alias (host.jp apex empty today).
        assert.equal(isBlockedUserMediaUrl("http://localhost.host.jp/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.host.jp/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.host.jp/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.host.jp/"), true)
        // corp.com: entire zone → 127.0.53.53 loopback (same class as fbi.com).
        assert.equal(isBlockedUserMediaUrl("http://corp.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.corp.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.corp.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.corp.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localhost.corp.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://CORP.COM/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://corp.com/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://www.corp.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://corp.com/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://corp.com/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://corp.com/"), true)
        // host.in: apex + www → 172.16.210.97 RFC1918 (wildcards empty; ns1/ns2 public).
        assert.equal(isBlockedUserMediaUrl("http://host.in/"), true)
        assert.equal(isBlockedUserMediaUrl("http://host.in:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.host.in/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.host.in/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://host.in/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://www.host.in/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://host.in/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://host.in/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://host.in/"), true)
        // 127001.lt: sibling of denied 127001.it (apex → 127.0.0.1; wildcards empty).
        assert.equal(isBlockedUserMediaUrl("http://127001.lt/"), true)
        assert.equal(isBlockedUserMediaUrl("http://127001.lt:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.127001.lt/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://127001.LT/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://127001.lt/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://127001.lt/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://127001.lt/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://127001.lt/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://127001.lt/"), true)
        // corp.co: sibling of denied corp.com (apex + first-level wildcards → 127.0.0.1).
        // Nested bar.foo.corp.co is public parking (suffix-deny tradeoff like local.cl).
        assert.equal(isBlockedUserMediaUrl("http://corp.co/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.corp.co/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.corp.co/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.corp.co:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.corp.co/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://CORP.CO/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://corp.co/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://www.corp.co/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://corp.co/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://corp.co/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://corp.co/"), true)
        // corp.xyz: sibling of denied corp.com (unlabeled wildcards → 127.0.0.1; apex empty).
        assert.equal(isBlockedUserMediaUrl("http://corp.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.corp.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.corp.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.corp.xyz:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.corp.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.corp.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.corp.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.corp.xyz/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://corp.xyz/"), true)
        // localfabriek.nl: documented public wildcard loopback.
        assert.equal(isBlockedUserMediaUrl("http://localfabriek.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localfabriek.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localfabriek.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("http://app.localfabriek.nl:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://bar.foo.localfabriek.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://FOO.LOCALFABRIEK.NL/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://foo.localfabriek.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localfabriek.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.localfabriek.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://foo.localfabriek.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localfabriek.nl/"), true)
        // local.qinlili.bid: documented HSTS-preloaded localhost alias.
        // Do not deny public qinlili.bid.
        assert.equal(isBlockedUserMediaUrl("http://local.qinlili.bid/"), true)
        assert.equal(isBlockedUserMediaUrl("http://local.qinlili.bid:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.local.qinlili.bid/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://local.qinlili.bid/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://local.qinlili.bid/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://local.qinlili.bid/"), true)
        assert.equal(isBlockedUserMediaUrl("https://qinlili.bid/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.qinlili.bid/"), false)
        // A2 Hosting unused localhost alias. Do not deny public a2hosting.com.
        assert.equal(isBlockedUserMediaUrl("http://localhost.a2hosting.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.a2hosting.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.a2hosting.com/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.a2hosting.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.a2hosting.com/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.a2hosting.com/"), true)
        assert.equal(isBlockedUserMediaUrl("https://a2hosting.com/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.a2hosting.com/"), false)
        // AMD unused localhost alias. Do not deny public amd.com.
        assert.equal(isBlockedUserMediaUrl("http://localhost.amd.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.amd.com:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.amd.com/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.amd.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.amd.com/"), true)
        assert.equal(isBlockedUserMediaUrl("https://amd.com/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.amd.com/"), false)
        // Gandi unused localhost alias. Do not deny public gandi.net.
        assert.equal(isBlockedUserMediaUrl("http://localhost.gandi.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.gandi.net:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.gandi.net/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.gandi.net/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localhost.gandi.net/"), true)
        assert.equal(isBlockedUserMediaUrl("https://gandi.net/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.gandi.net/"), false)
        // HostGator India unused localhost alias. Do not deny public hostgator.in.
        assert.equal(isBlockedUserMediaUrl("http://localhost.hostgator.in/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.hostgator.in/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.hostgator.in/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.hostgator.in/"), true)
        assert.equal(isBlockedUserMediaUrl("https://hostgator.in/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.hostgator.in/"), false)
        // PHP unused localhost alias. Do not deny public php.net.
        assert.equal(isBlockedUserMediaUrl("http://localhost.php.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.php.net:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.php.net/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.php.net/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.php.net/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.php.net/"), true)
        assert.equal(isBlockedUserMediaUrl("https://php.net/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.php.net/"), false)

        // Unused vendor localhost aliases (apex → 127.0.0.1). Deny `localhost.<parent>`
        // only; public parents (pair.com, mail.ru, a2hosting.net, gandi.fr, …) stay allowed.
        const unusedVendorLocalhost = [
            "localhost.pair.com",
            "localhost.pairnic.com",
            "localhost.pairnetworks.com",
            "localhost.a2hosting.net",
            "localhost.a2hosting.org",
            "localhost.a2hosting.co",
            "localhost.a2webhosting.com",
            "localhost.mail.ru",
            "localhost.rambler.ru",
            "localhost.justhost.ru",
            "localhost.masterhost.ru",
            "localhost.mchost.ru",
            "localhost.nic.ru",
            "localhost.rbc.ru",
            "localhost.gandi.fr",
            "localhost.online.net",
            "localhost.hostgator.com.br",
            "localhost.fatcow.com",
            "localhost.arvixe.com",
            // Unused vendor localhost aliases (apex → 127.0.0.1, except hopto.org →
            // 10.10.10.10 RFC1918). Deny `localhost.<parent>` only; public parents stay allowed.
            "localhost.123-reg.co.uk",
            "localhost.123-reg.com",
            "localhost.free.fr",
            "localhost.online.fr",
            "localhost.pair.org",
            "localhost.pair.net",
            "localhost.pairnic.net",
            "localhost.amd.net",
            "localhost.no-ip.org",
            "localhost.no-ip.com",
            "localhost.hopto.org",
            "localhost.zapto.org",
            "localhost.sytes.net",
            "localhost.servehttp.com",
            "localhost.mybluehost.me",
            "localhost.websitewelcome.com",
            "localhost.afraid.org",
            "localhost.siteground.net",
            "localhost.siteground.org",
            "localhost.a2webhosting.net",
            "localhost.infomaniak.ch",
            "localhost.inmotionhosting.net",
            "localhost.namecheaphosting.com",
            "localhost.hostgator.org",
            "localhost.donuts.domains",
            "localhost.pir.org",
        ]
        for (const host of unusedVendorLocalhost) {
            assert.equal(isBlockedUserMediaUrl(`http://${host}/`), true, host)
            assert.equal(isBlockedUserMediaUrl(`http://${host}:5432/`), true, host)
            assert.equal(isBlockedUserMediaUrl(`HTTP://${host.toUpperCase()}/`), true, host)
            assert.equal(isBlockedUserMediaUrl(`link:http://${host}/`), true, host)
            assert.equal(isBlockedUserMediaUrl(`uri:http://${host}:2333/`), true, host)
            assert.equal(isBlockedUserMediaUrl(`icy://${host}/`), true, host)
            assert.equal(isBlockedUserMediaUrl(`ytsearch:http://${host}/`), true, host)
            assert.equal(isBlockedUserMediaUrl(`local:http://${host}/`), true, host)
        }
        assert.equal(isBlockedUserMediaUrl("http://pair.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://mail.ru/"), false)
        assert.equal(isBlockedUserMediaUrl("http://a2hosting.net/"), false)
        assert.equal(isBlockedUserMediaUrl("http://gandi.fr/"), false)
        assert.equal(isBlockedUserMediaUrl("http://hostgator.com.br/"), false)
        assert.equal(isBlockedUserMediaUrl("http://online.net/"), false)
        assert.equal(isBlockedUserMediaUrl("http://fatcow.com/"), false)
        // servehttp.com unused localhost zone also wildcards www/foo → 127.0.0.1
        assert.equal(isBlockedUserMediaUrl("http://www.localhost.servehttp.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.servehttp.com:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://123-reg.co.uk/"), false)
        assert.equal(isBlockedUserMediaUrl("http://pair.org/"), false)
        assert.equal(isBlockedUserMediaUrl("http://no-ip.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://free.fr/"), false)
        assert.equal(isBlockedUserMediaUrl("http://online.fr/"), false)
        assert.equal(isBlockedUserMediaUrl("http://mybluehost.me/"), false)
        assert.equal(isBlockedUserMediaUrl("http://websitewelcome.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://afraid.org/"), false)
        assert.equal(isBlockedUserMediaUrl("http://siteground.net/"), false)
        assert.equal(isBlockedUserMediaUrl("http://namecheaphosting.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://donuts.domains/"), false)
        assert.equal(isBlockedUserMediaUrl("http://pir.org/"), false)
        assert.equal(isBlockedUserMediaUrl("http://hopto.org/"), false)
        // Remaining No-IP unused localhost aliases (siblings of denied no-ip.com /
        // zapto.org / sytes.net / servehttp.com / hopto.org). Apex → 127.0.0.1
        // except ddnsgeek → 192.168.0.167. Do not deny public parent zones.
        assert.equal(isBlockedUserMediaUrl("http://localhost.serveftp.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.serveftp.net:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.servegame.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.myftp.org/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.myftp.biz/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.myvnc.com:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.redirectme.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.homelinux.org/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.homelinux.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.homeip.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.dynalias.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.dynalias.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.dynalias.org/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.no-ip.info/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.ddnsgeek.com/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALHOST.SERVEFTP.COM/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.serveftp.com/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:https://localhost.myftp.org/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.dynalias.com/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.redirectme.net/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.ddnsgeek.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://serveftp.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://myftp.org/"), false)
        assert.equal(isBlockedUserMediaUrl("http://dynalias.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://ddnsgeek.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://no-ip.info/"), false)
        // Unused vendor localhost aliases. www.localhost.lflink.com is public
        // (suffix-deny tradeoff). Do not deny public freedns.com / lflink.com /
        // siteground.eu / siteground.us.
        assert.equal(isBlockedUserMediaUrl("http://localhost.freedns.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.lflink.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localhost.lflink.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.siteground.eu/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.siteground.us:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.freedns.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.lflink.com/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.siteground.eu/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.siteground.us/"), true)
        assert.equal(isBlockedUserMediaUrl("http://freedns.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://lflink.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://siteground.eu/"), false)
        assert.equal(isBlockedUserMediaUrl("http://siteground.us/"), false)
        // Remaining unused localhost aliases (siblings of denied 127001.it / serveftp.com /
        // no-ip.org). Apex → 127.0.0.1. Do not deny public parent zones.
        assert.equal(isBlockedUserMediaUrl("http://localhost.127001.ch/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.127001.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.127001.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.127001.dk/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.homeunix.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.hostnet.nl/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.noip.org:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.serveftp.org/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.servemp3.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.webhop.biz/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.webhop.info/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.webhop.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.whm.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.dedibox.fr/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.ols.com/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALHOST.HOSTNET.NL/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.127001.com/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:https://localhost.servemp3.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.webhop.net/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.whm.com/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.dedibox.fr/"), true)
        assert.equal(isBlockedUserMediaUrl("http://127001.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://hostnet.nl/"), false)
        assert.equal(isBlockedUserMediaUrl("http://noip.org/"), false)
        assert.equal(isBlockedUserMediaUrl("http://serveftp.org/"), false)
        assert.equal(isBlockedUserMediaUrl("http://servemp3.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://webhop.net/"), false)
        assert.equal(isBlockedUserMediaUrl("http://whm.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://dedibox.fr/"), false)
        assert.equal(isBlockedUserMediaUrl("http://ols.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://homeunix.com/"), false)

        // Remaining unused No-IP / YDNS localhost aliases (apex → 127.0.0.1).
        // Do not deny public parents dnsalias.com / .net / .org, mine.nu, ydns.eu / ydns.org.
        assert.equal(isBlockedUserMediaUrl("http://localhost.dnsalias.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.dnsalias.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALHOST.DNSALIAS.COM/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.dnsalias.com/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localhost.dnsalias.net/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.dnsalias.org/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.dnsalias.net/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.dnsalias.org/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.mine.nu/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.mine.nu:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.mine.nu/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.mine.nu/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.mine.nu/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.ydns.eu/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.ydns.org/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.ydns.org:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.ydns.eu/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localhost.ydns.org/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.ydns.eu/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.ydns.org/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.ydns.eu/"), true)
        // Public parent zones must stay allowed.
        assert.equal(isBlockedUserMediaUrl("http://dnsalias.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://www.dnsalias.net/"), false)
        assert.equal(isBlockedUserMediaUrl("http://mine.nu/"), false)
        assert.equal(isBlockedUserMediaUrl("http://ydns.eu/"), false)
        assert.equal(isBlockedUserMediaUrl("http://ydns.org/"), false)

        // Remaining unused localhost aliases (apex → 127.0.0.1).
        // Do not deny public parents homeftp.org / sprinthost.ru / lacnic.net /
        // apache.com / haproxy.com, or public localhost.lu / .ro / .be.
        assert.equal(isBlockedUserMediaUrl("http://localhost.homeftp.org/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.homeftp.org:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://LOCALHOST.HOMEFTP.ORG/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.homeftp.org/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localhost.sprinthost.ru/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.lacnic.net/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.apache.com/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.haproxy.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.sprinthost.ru/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.lacnic.net:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.apache.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.haproxy.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.haproxy.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.apache.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.sm/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.sm:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.sm/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.sm/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.sm/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.sm/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.localhost.lu/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.localhost.ro/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.localhost.be:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.localhost.lu/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localhost.localhost.ro/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.localhost.be/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.localhost.lu/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.localhost.ro/"), true)
        // Public parent zones must stay allowed.
        assert.equal(isBlockedUserMediaUrl("http://homeftp.org/"), false)
        assert.equal(isBlockedUserMediaUrl("http://www.homeftp.org/"), false)
        assert.equal(isBlockedUserMediaUrl("http://sprinthost.ru/"), false)
        assert.equal(isBlockedUserMediaUrl("http://lacnic.net/"), false)
        assert.equal(isBlockedUserMediaUrl("http://apache.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://haproxy.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://localhost.lu/"), false)
        assert.equal(isBlockedUserMediaUrl("http://www.localhost.lu/"), false)
        assert.equal(isBlockedUserMediaUrl("http://localhost.ro/"), false)
        assert.equal(isBlockedUserMediaUrl("http://localhost.be/"), false)
        // Remaining unused localhost aliases after #12/#17–#49. FreeDNS unused
        // aliases (do not deny public mooo.com / strangled.net / ignorelist.com /
        // crabdance.com / jumpingcrab.com / twilightparadox.com / us.to /
        // soon.it / undo.it) plus unused vendor localhost labels (do not deny
        // public parents). localhost.kasserver.com also has nested wildcards.
        // Distinct from denied localhost.fatcow.com / localhost.lacnic.net.
        assert.equal(isBlockedUserMediaUrl("http://localhost.mooo.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.mooo.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.strangled.net/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localhost.ignorelist.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.crabdance.com/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.jumpingcrab.com/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.twilightparadox.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.us.to/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.soon.it:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.undo.it/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.us.to/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.soon.it/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.freebsd.org/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.netbsd.org:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.dragonflybsd.org/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.sun.com/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.ox.ac.uk/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://localhost.imperial.ac.uk/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://localhost.opencart.com/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.panasonic.com/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.micron.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.gskill.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.webhostingpad.com:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.fatcow.net/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.wiredtree.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.softlayer.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.kasserver.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://www.localhost.kasserver.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.localhost.kasserver.com:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://localhost.kasserver.com/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://foo.localhost.kasserver.com/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.csail.mit.edu/"), true)
        assert.equal(isBlockedUserMediaUrl("http://localhost.usenix.org:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://localhost.csail.mit.edu/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://localhost.usenix.org/"), true)
        // Public parents of the new suffixes must stay allowed.
        assert.equal(isBlockedUserMediaUrl("http://mooo.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://www.mooo.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://foo.ignorelist.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://freebsd.org/"), false)
        assert.equal(isBlockedUserMediaUrl("http://kasserver.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://fatcow.net/"), false)

        // Remaining unused localhost aliases after #12/#17–#50 (apex → 127.0.0.1, or
        // localhost.ed.ac.uk → 172.20.0.202 RFC1918). Do not deny public parents.
        const leftoverLocalhostAliases = [
            "localhost.doesntexist.com",
            "localhost.doesntexist.org",
            "localhost.ftp.sh",
            "localhost.h4ck.me",
            "localhost.mine.bz",
            "localhost.wiki.gd",
            "localhost.x10host.com",
            "localhost.root.sx",
            "localhost.ed.ac.uk",
            "localhost.cornell.edu",
            "localhost.columbia.edu",
            "localhost.autodesk.com",
            "localhost.ea.com",
            "localhost.ubisoft.com",
            "localhost.lua.org",
            "localhost.cnn.com",
            "localhost.nytimes.com",
            "localhost.citibank.com",
            "localhost.nih.gov",
            "localhost.who.int",
            "localhost.creativecommons.org",
        ]
        for (const host of leftoverLocalhostAliases) {
            assert.equal(isBlockedUserMediaUrl(`http://${host}/`), true, host)
            assert.equal(isBlockedUserMediaUrl(`https://${host}:5432/`), true, host)
            assert.equal(isBlockedUserMediaUrl(`HTTP://${host.toUpperCase()}/`), true, host)
            assert.equal(isBlockedUserMediaUrl(`link:http://${host}/`), true, host)
            assert.equal(isBlockedUserMediaUrl(`uri:http://${host}/audio.mp3`), true, host)
            assert.equal(isBlockedUserMediaUrl(`icy://${host}/stream`), true, host)
            assert.equal(isBlockedUserMediaUrl(`ytsearch:http://${host}:2333/`), true, host)
            assert.equal(isBlockedUserMediaUrl(`local:http://${host}/`), true, host)
        }
        // ix.tc: dedicated loopback apex (wildcards empty).
        assert.equal(isBlockedUserMediaUrl("http://ix.tc/"), true)
        assert.equal(isBlockedUserMediaUrl("http://ix.tc:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("http://foo.ix.tc/"), true)
        assert.equal(isBlockedUserMediaUrl("HTTP://IX.TC/"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://ix.tc/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://ix.tc/audio.mp3"), true)
        assert.equal(isBlockedUserMediaUrl("icy://ix.tc/stream"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://ix.tc:2333/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://ix.tc/"), true)
        // Public parents of unused localhost aliases must stay allowed.
        assert.equal(isBlockedUserMediaUrl("http://doesntexist.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://www.doesntexist.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://doesntexist.org/"), false)
        assert.equal(isBlockedUserMediaUrl("http://ftp.sh/"), false)
        assert.equal(isBlockedUserMediaUrl("http://www.ftp.sh/"), false)
        // h4ck.me apex is empty today; do not suffix-deny the parent.
        assert.equal(isBlockedUserMediaUrl("http://h4ck.me/"), false)
        assert.equal(isBlockedUserMediaUrl("http://mine.bz/"), false)
        assert.equal(isBlockedUserMediaUrl("http://www.mine.bz/"), false)
        assert.equal(isBlockedUserMediaUrl("http://wiki.gd/"), false)
        assert.equal(isBlockedUserMediaUrl("http://x10host.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://www.x10host.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://root.sx/"), false)
        assert.equal(isBlockedUserMediaUrl("http://www.root.sx/"), false)
        assert.equal(isBlockedUserMediaUrl("http://ed.ac.uk/"), false)
        assert.equal(isBlockedUserMediaUrl("http://www.ed.ac.uk/"), false)
        assert.equal(isBlockedUserMediaUrl("http://cornell.edu/"), false)
        assert.equal(isBlockedUserMediaUrl("http://columbia.edu/"), false)
        assert.equal(isBlockedUserMediaUrl("http://autodesk.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://ea.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://ubisoft.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://lua.org/"), false)
        assert.equal(isBlockedUserMediaUrl("http://cnn.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://nytimes.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://citibank.com/"), false)
        assert.equal(isBlockedUserMediaUrl("http://nih.gov/"), false)
        assert.equal(isBlockedUserMediaUrl("http://who.int/"), false)
        assert.equal(isBlockedUserMediaUrl("http://creativecommons.org/"), false)

        // Remaining unused localhost.<parent> aliases after #12/#17–#51.
        // Apex → 127.0.0.1 unless noted. Do not deny public parents.
        const unusedLocalhostAliases = [
            "localhost.usc.edu",
            "localhost.ucla.edu",
            "localhost.ethz.ch",
            "localhost.pfizer.com",
            "localhost.gov.za",
            "localhost.uwaterloo.ca",
            // RFC1918 siteLocal (Java InetAddress); umd.edu :80/:443 CONNECTED.
            "localhost.umd.edu",
            "localhost.qut.edu.au",
            "localhost.warnerbros.com",
        ]
        for (const host of unusedLocalhostAliases) {
            assert.equal(isBlockedUserMediaUrl(`http://${host}/`), true)
            assert.equal(isBlockedUserMediaUrl(`http://${host}:5432/`), true)
            assert.equal(isBlockedUserMediaUrl(`HTTP://${host.toUpperCase()}/`), true)
            assert.equal(isBlockedUserMediaUrl(`link:http://${host}/`), true)
            assert.equal(isBlockedUserMediaUrl(`uri:http://${host}/`), true)
            assert.equal(isBlockedUserMediaUrl(`icy://${host}/`), true)
            assert.equal(isBlockedUserMediaUrl(`ytsearch:http://${host}/`), true)
            assert.equal(isBlockedUserMediaUrl(`local:http://${host}/`), true)
        }
        assert.equal(isBlockedUserMediaUrl("https://www.usc.edu/"), false)
        assert.equal(isBlockedUserMediaUrl("https://umd.edu/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.gov.za/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.pfizer.com/"), false)
        assert.equal(isBlockedUserMediaUrl("https://www.warnerbros.com/"), false)
    })

    it("rejects private hosts wrapped in lavalink-client source prefixes", () => {
        assert.equal(isBlockedUserMediaUrl("link:http://127.0.0.1:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://postgres-db:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("LINK:http://10.0.0.5/"), true)
        assert.equal(isBlockedUserMediaUrl("yt:http://127.0.0.1/"), true)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://postgres-db:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("sc:http://169.254.169.254/"), true)
        assert.equal(isBlockedUserMediaUrl("local:http://192.168.1.1/"), true)
        assert.equal(isBlockedUserMediaUrl("spsearch:http://172.16.0.2/"), true)
        assert.equal(isBlockedUserMediaUrl("bcsearch:http://127.0.0.1/"), true)
    })

    it("rejects icy:// aliases that lavaplayer rewrites to http://", () => {
        assert.equal(isBlockedUserMediaUrl("icy://postgres-db:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://127.0.0.1/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://10.0.0.5/"), true)
        assert.equal(isBlockedUserMediaUrl("ICY://localhost/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://192.168.1.1/"), true)
        assert.equal(isBlockedUserMediaUrl("icy://radio.example.com/stream"), false)
    })

    it("fails closed on unparseable http(s) strings", () => {
        assert.equal(isBlockedUserMediaUrl("http://"), true)
        assert.equal(isBlockedUserMediaUrl("link:http://"), true)
        assert.equal(isBlockedUserMediaUrl("icy://"), true)
    })

    it("rejects link:/uri: wrappers around private or Docker-internal HTTP targets", () => {
        // lavalink-client strips link:/uri: and sends the remainder as /loadtracks identifier
        assert.equal(isBlockedUserMediaUrl("link:http://127.0.0.1:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://postgres-db:5432/"), true)
        assert.equal(isBlockedUserMediaUrl("LINK:http://10.0.0.5/audio.mp3"), true)
        assert.equal(isBlockedUserMediaUrl("  uri:HTTP://localhost:3001/ws  "), true)
        assert.equal(isBlockedUserMediaUrl("link:http://192.168.1.10/track.mp3"), true)
        assert.equal(isBlockedUserMediaUrl("uri:http://[::1]/"), true)
        assert.equal(
            isBlockedUserMediaUrl("link:https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            false
        )
        assert.equal(isBlockedUserMediaUrl("uri:https://soundcloud.com/artist/track"), false)
        assert.equal(isBlockedUserMediaUrl("ytsearch:http://127.0.0.1/"), true)
    })
})

describe("rawHttpUrlHostname", () => {
    it("keeps leading-zero IPv4 octets instead of WHATWG octal rewrite", () => {
        assert.equal(rawHttpUrlHostname("http://010.0.0.1:5432/"), "010.0.0.1")
        assert.equal(rawHttpUrlHostname("http://010.1:5432/"), "010.1")
        assert.equal(rawHttpUrlHostname("http://010.0.1/"), "010.0.1")
        assert.equal(rawHttpUrlHostname("http://172.017.0.1/"), "172.017.0.1")
        assert.equal(rawHttpUrlHostname("http://user:pass@0172.017.0.1:2333/x"), "0172.017.0.1")
        assert.equal(rawHttpUrlHostname("icy://010.0.0.1/stream"), "010.0.0.1")
        assert.equal(rawHttpUrlHostname("http://[::1]/"), "[::1]")
        assert.equal(
            rawHttpUrlHostname("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            "www.youtube.com"
        )
    })
})

describe("unwrapDirectLinkSourcePrefix", () => {
    it("strips link:/uri: once and leaves other queries unchanged", () => {
        assert.equal(unwrapDirectLinkSourcePrefix("link:http://127.0.0.1/"), "http://127.0.0.1/")
        assert.equal(
            unwrapDirectLinkSourcePrefix("URI:https://example.com/a"),
            "https://example.com/a"
        )
        assert.equal(unwrapDirectLinkSourcePrefix("  link: http://x/ "), "http://x/")
        assert.equal(unwrapDirectLinkSourcePrefix("http://127.0.0.1/"), "http://127.0.0.1/")
        assert.equal(unwrapDirectLinkSourcePrefix("ytsearch:rick"), "ytsearch:rick")
    })
})
