import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "success"
  size?: "default" | "sm" | "lg" | "icon" | "xl"
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
  outline: "border border-border bg-card/40 text-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground",
  secondary: "border border-border/70 bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
  link: "text-primary underline-offset-4 hover:underline",
  success: "bg-success text-success-foreground hover:bg-success/90 shadow-sm",
}

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: "h-10 px-4 py-2 font-semibold",
  sm: "h-9 rounded-md px-3 text-sm font-semibold",
  lg: "h-11 rounded-lg px-6 text-base font-semibold",
  xl: "h-12 rounded-lg px-8 text-base font-bold",
  icon: "h-10 w-10 rounded-lg",
}

const baseClasses =
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none active:scale-[0.99]"

/** Drop-in replacement for the CVA-based buttonVariants used by shadcn components. */
export function buttonVariants(
  opts: { variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; className?: string } = {}
): string {
  return cn(
    baseClasses,
    variantClasses[opts.variant ?? "default"],
    sizeClasses[opts.size ?? "default"],
    opts.className,
  )
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"

    return (
      <Comp
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
