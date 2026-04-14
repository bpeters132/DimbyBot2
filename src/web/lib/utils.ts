import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** Merges class names using clsx + tailwind-merge for shadcn components. */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs))
}
