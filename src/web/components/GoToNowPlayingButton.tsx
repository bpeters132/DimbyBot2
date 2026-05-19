"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Music2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ApiResponse, VoiceContextResponse } from "@/types/web"

const POLL_INTERVAL_MS = 20_000

/** True on `/dashboard/[guildId]` player controls, not the guild list. */
function isGuildPlayerControlsPage(pathname: string): boolean {
    return /^\/dashboard\/\d+$/.test(pathname)
}

export function GoToNowPlayingButton() {
    const pathname = usePathname()
    const [activeGuild, setActiveGuild] = useState<VoiceContextResponse["activeGuild"]>(null)
    const [loaded, setLoaded] = useState(false)

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/guilds/voice-context", {
                credentials: "include",
                cache: "no-store",
            })
            if (!res.ok) {
                setActiveGuild(null)
                return
            }
            const payload = (await res.json()) as ApiResponse<VoiceContextResponse>
            if (payload.ok === true) {
                setActiveGuild(payload.data.activeGuild)
            } else {
                setActiveGuild(null)
            }
        } catch {
            setActiveGuild(null)
        } finally {
            setLoaded(true)
        }
    }, [])

    useEffect(() => {
        if (isGuildPlayerControlsPage(pathname)) {
            return
        }
        void refresh()
        const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
        const onFocus = () => void refresh()
        window.addEventListener("focus", onFocus)
        return () => {
            window.clearInterval(interval)
            window.removeEventListener("focus", onFocus)
        }
    }, [pathname, refresh])

    if (!loaded || !activeGuild || isGuildPlayerControlsPage(pathname)) {
        return null
    }

    const subtitle =
        activeGuild.currentTrackTitle ??
        (activeGuild.status === "playing"
            ? "Now playing"
            : activeGuild.status === "paused"
              ? "Paused"
              : "In voice")

    return (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex justify-end p-4 sm:bottom-6 sm:right-6">
            <Button
                asChild
                size="lg"
                className="pointer-events-auto h-auto max-w-[min(100vw-2rem,20rem)] gap-3 px-4 py-3 shadow-lg"
            >
                <Link
                    href={`/dashboard/${activeGuild.guildId}`}
                    prefetch={false}
                    aria-label={`Go to now playing in ${activeGuild.guildName}`}
                >
                    {activeGuild.guildIconUrl ? (
                        <Image
                            src={activeGuild.guildIconUrl}
                            alt=""
                            width={32}
                            height={32}
                            className="h-8 w-8 shrink-0 rounded-full"
                            unoptimized
                        />
                    ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20">
                            <Music2 className="h-4 w-4" aria-hidden />
                        </span>
                    )}
                    <span className="min-w-0 text-left">
                        <span className="block text-sm font-semibold leading-tight">Go to now playing</span>
                        <span className="block truncate text-xs font-normal opacity-90">
                            {activeGuild.guildName} · {subtitle}
                        </span>
                    </span>
                </Link>
            </Button>
        </div>
    )
}
