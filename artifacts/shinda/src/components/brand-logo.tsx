import * as React from "react";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  showTagline?: boolean;
};

const sizeClasses = {
  sm: { mark: "h-7 w-7", word: "text-base", gap: "gap-2" },
  md: { mark: "h-8 w-8", word: "text-lg", gap: "gap-2.5" },
  lg: { mark: "h-10 w-10", word: "text-3xl", gap: "gap-3" },
};

/**
 * SHINDA24/7 brand mark.
 * The angular S is a custom, scalable vector: clear at favicon size,
 * recognizable without the wordmark, and independent of decorative imagery.
 */
export function BrandLogo({ size = "md", className, showTagline = false }: BrandLogoProps) {
  const scale = sizeClasses[size];

  return (
    <span className={cn("inline-flex items-center", scale.gap, className)} role="img" aria-label="Shinda 24/7">
      <svg
        aria-hidden="true"
        viewBox="0 0 40 40"
        className={cn(scale.mark, "shrink-0")}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="shinda-mark-orange" x1="5" y1="6" x2="34" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF8A1F" />
            <stop offset="1" stopColor="#FF5A00" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="38" height="38" rx="11" fill="url(#shinda-mark-orange)" />
        <path
          d="M12 8H26.5L32 13.5L22 20.5L28 26.5L22.5 32H8.5L4.5 28L14.5 19.5L8.5 13.5L12 8Z"
          fill="white"
          stroke="white"
          strokeWidth="0.5"
          strokeLinejoin="round"
        />
        <path d="M13 13H22L18 16.5L22.5 20.5L17 25.5H12L18 20L13 15.5L13 13Z" fill="#FF6B00" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className={cn("font-display font-bold tracking-tight", scale.word)}>
          <span className="text-foreground">SHINDA</span><span className="text-primary">24/7</span>
        </span>
        {showTagline && <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Play with purpose</span>}
      </span>
    </span>
  );
}
