import * as React from "react"
import { cn } from "@/lib/utils"

const variantClass: Record<"default" | "outline", string> = {
    default:
        "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-50",
    outline:
        "inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1 text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50",
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "outline"
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", type = "button", ...props }, ref) => (
        <button ref={ref} type={type} className={cn(variantClass[variant], className)} {...props} />
    )
)
Button.displayName = "Button"
