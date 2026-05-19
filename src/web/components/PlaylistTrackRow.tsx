"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { DragEvent, FocusEvent } from "react"
import { GripVertical } from "lucide-react"
import { formatDurationMs } from "@/lib/format-duration"
import { playlistTrackThumbnailUrl } from "@/lib/playlist-thumbnail"
import { sanitizeHttpUrl } from "@/lib/url-utils"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { PlaylistTrackData } from "@/types/web"

const POPOVER_WIDTH_PX = 320
const POPOVER_CURSOR_GAP_PX = 10

function clampPopoverPoint(left: number, top: number): { left: number; top: number } {
    const margin = 8
    const halfHeightEstimate = 80
    const maxLeft = window.innerWidth - POPOVER_WIDTH_PX - margin
    const clampedLeft = Math.max(margin, Math.min(left, maxLeft))
    const clampedTop = Math.max(
        halfHeightEstimate + margin,
        Math.min(top, window.innerHeight - halfHeightEstimate - margin)
    )
    return { left: clampedLeft, top: clampedTop }
}

export interface PlaylistTrackRowProps {
    track: PlaylistTrackData
    displayIndex: number
    busy: boolean
    isDragging: boolean
    isDropTarget: boolean
    onRemove: () => void
    onDragStart: (event: DragEvent<HTMLLIElement>) => void
    onDragOver: (event: DragEvent<HTMLLIElement>) => void
    onDragLeave: () => void
    onDrop: (event: DragEvent<HTMLLIElement>) => void
    onDragEnd: () => void
}

export function PlaylistTrackRow({
    track,
    displayIndex,
    busy,
    isDragging,
    isDropTarget,
    onRemove,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
}: PlaylistTrackRowProps) {
    const liRef = useRef<HTMLLIElement>(null)
    const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
    const hoverRafRef = useRef<number | null>(null)
    const pendingAnchorRef = useRef<{ x: number; y: number } | null>(null)

    const safeTrackUrl = useMemo(() => sanitizeHttpUrl(track.uri), [track.uri])
    const safeThumbnailUrl = useMemo(() => playlistTrackThumbnailUrl(track), [track])

    const popoverLayout = anchor
        ? clampPopoverPoint(anchor.x + POPOVER_CURSOR_GAP_PX, anchor.y)
        : null

    const clearScheduledAnchorUpdate = () => {
        if (hoverRafRef.current !== null) {
            window.cancelAnimationFrame(hoverRafRef.current)
            hoverRafRef.current = null
        }
        pendingAnchorRef.current = null
    }

    const scheduleAnchorUpdate = (x: number, y: number) => {
        pendingAnchorRef.current = { x, y }
        if (hoverRafRef.current !== null) return
        hoverRafRef.current = window.requestAnimationFrame(() => {
            hoverRafRef.current = null
            if (pendingAnchorRef.current) {
                setAnchor(pendingAnchorRef.current)
            }
        })
    }

    useEffect(() => {
        return () => {
            clearScheduledAnchorUpdate()
        }
    }, [])

    const handleRowFocus = (event: FocusEvent<HTMLElement>) => {
        const rect = event.currentTarget.getBoundingClientRect()
        setAnchor({
            x: rect.right,
            y: rect.top + rect.height / 2,
        })
    }

    const handleRowBlur = (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setAnchor(null)
        }
    }

    const rowLine = (
        <>
            <p className="font-medium">
                {displayIndex}. {track.title}
            </p>
            <p className="text-sm text-muted-foreground">
                {track.author} · {formatDurationMs(track.duration)}
            </p>
        </>
    )

    const hoverSurfaceClass =
        "-m-2 block cursor-pointer rounded-sm p-2 text-inherit no-underline decoration-transparent outline-none ring-offset-background transition-colors hover:bg-accent/50 hover:no-underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

    return (
        <li
            ref={liRef}
            draggable={!busy}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            className={cn(
                "flex items-start gap-2 rounded border bg-background p-2 transition-colors",
                isDragging && "opacity-50",
                isDropTarget && "border-primary ring-2 ring-ring ring-offset-2 ring-offset-background"
            )}
            onMouseMove={(event) => scheduleAnchorUpdate(event.clientX, event.clientY)}
            onMouseLeave={() => {
                clearScheduledAnchorUpdate()
                window.requestAnimationFrame(() => {
                    if (!liRef.current?.contains(document.activeElement)) {
                        setAnchor(null)
                    }
                })
            }}
        >
            <span
                className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground active:cursor-grabbing aria-disabled:opacity-50"
                aria-label={`Drag to reorder track ${displayIndex}`}
                aria-disabled={busy}
            >
                <GripVertical className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
                {safeTrackUrl ? (
                    <a
                        href={safeTrackUrl}
                        target="_blank"
                        rel="noreferrer"
                        draggable={false}
                        className={hoverSurfaceClass}
                        aria-label={`Open track source: ${track.title}`}
                        onFocus={handleRowFocus}
                        onBlur={handleRowBlur}
                    >
                        {rowLine}
                    </a>
                ) : (
                    <span className={hoverSurfaceClass}>{rowLine}</span>
                )}
            </span>
            <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={busy}
                onClick={onRemove}
            >
                Remove
            </Button>
            {popoverLayout ? (
                <aside
                    className="fixed z-50 w-80 -translate-y-1/2 rounded border bg-popover p-3 text-popover-foreground shadow-lg"
                    style={{ left: popoverLayout.left, top: popoverLayout.top }}
                >
                    <div className="flex gap-3">
                        {safeThumbnailUrl ? (
                            <img
                                src={safeThumbnailUrl}
                                alt="playlist track artwork"
                                className="h-16 w-16 shrink-0 rounded object-cover"
                            />
                        ) : (
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                                No Art
                            </div>
                        )}
                        <div className="min-w-0 space-y-1 text-sm">
                            <p className="truncate font-medium">{track.title}</p>
                            <p className="text-muted-foreground">
                                Duration: {formatDurationMs(track.duration)}
                            </p>
                            <p className="text-muted-foreground">Artist: {track.author}</p>
                            {safeTrackUrl ? (
                                <p className="truncate text-muted-foreground">Source: {safeTrackUrl}</p>
                            ) : null}
                        </div>
                    </div>
                </aside>
            ) : null}
        </li>
    )
}
