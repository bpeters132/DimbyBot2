import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    isPrivateLanOrLoopbackPeer,
    shouldEnforceBotApiPrivateClientIp,
} from "./botApiPrivatePeer.js"

describe("botApiPrivatePeer", () => {
    it("allows RFC1918, loopback, and IPv4-mapped private peers", () => {
        assert.equal(isPrivateLanOrLoopbackPeer("10.0.0.1"), true)
        assert.equal(isPrivateLanOrLoopbackPeer("172.16.5.1"), true)
        assert.equal(isPrivateLanOrLoopbackPeer("192.168.1.20"), true)
        assert.equal(isPrivateLanOrLoopbackPeer("127.0.0.1"), true)
        assert.equal(isPrivateLanOrLoopbackPeer("::1"), true)
        assert.equal(isPrivateLanOrLoopbackPeer("::ffff:10.1.2.3"), true)
    })

    it("rejects public, malformed, and empty peers", () => {
        assert.equal(isPrivateLanOrLoopbackPeer("8.8.8.8"), false)
        assert.equal(isPrivateLanOrLoopbackPeer("172.15.0.1"), false)
        assert.equal(isPrivateLanOrLoopbackPeer("01.2.3.4"), false)
        assert.equal(isPrivateLanOrLoopbackPeer("not-an-ip"), false)
        assert.equal(isPrivateLanOrLoopbackPeer(""), false)
        assert.equal(isPrivateLanOrLoopbackPeer(undefined), false)
    })

    it("reads BOT_API_REQUIRE_PRIVATE_CLIENT_IP truthy flags", () => {
        const prev = process.env.BOT_API_REQUIRE_PRIVATE_CLIENT_IP
        try {
            process.env.BOT_API_REQUIRE_PRIVATE_CLIENT_IP = "true"
            assert.equal(shouldEnforceBotApiPrivateClientIp(), true)
            process.env.BOT_API_REQUIRE_PRIVATE_CLIENT_IP = "0"
            assert.equal(shouldEnforceBotApiPrivateClientIp(), false)
            process.env.BOT_API_REQUIRE_PRIVATE_CLIENT_IP = "yes"
            assert.equal(shouldEnforceBotApiPrivateClientIp(), true)
        } finally {
            if (prev === undefined) delete process.env.BOT_API_REQUIRE_PRIVATE_CLIENT_IP
            else process.env.BOT_API_REQUIRE_PRIVATE_CLIENT_IP = prev
        }
    })
})
