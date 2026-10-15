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
        <rect x="1" y="1" width="38" height="38" rx="11" fill="currentColor" className="text-primary" />
        <path d="M10 26.5L17 19.5L21.5 24L30 13.5" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M23.5 13.5H30V20" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
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
