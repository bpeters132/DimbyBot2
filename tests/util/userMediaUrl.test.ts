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
