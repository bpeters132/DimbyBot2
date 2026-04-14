"use client"

interface ConnectionStatusProps {
    connected: boolean
}

export function ConnectionStatus({ connected }: ConnectionStatusProps) {
    return (
        <div className="text-xs text-muted-foreground">
            Socket:{" "}
            <span
                className={connected ? "text-emerald-400" : "text-amber-400"}
                role="status"
                aria-live="polite"
            >
                {connected ? "connected" : "reconnecting..."}
            </span>
        </div>
    )
}
