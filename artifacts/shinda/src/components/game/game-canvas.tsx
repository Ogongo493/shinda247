import { useMemo } from "react";
import { motion } from "framer-motion";
import { Rocket, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRtdb } from "@/contexts/rtdb-context";
import type { GameState } from "@workspace/api-client-react";

interface GameCanvasProps {
  gameState?: GameState;
}

export function GameCanvas({ gameState }: GameCanvasProps) {
  const { smoothMultiplier, countdownMs } = useRtdb();
  const phase      = gameState?.phase || "waiting";
  const multiplier = phase === "flying" ? smoothMultiplier : (gameState?.multiplier || 1.0);
  const isCrashed  = phase === "crashed";
  const isFlying   = phase === "flying";
  const isWaiting  = phase === "waiting";
  const countdownSec = Math.ceil(countdownMs / 1000);

  const stars = useMemo(() =>
    Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top:  `${Math.random() * 100}%`,
      size: Math.random() * 2 + 1 + "px",
      delay:    `${Math.random() * 3}s`,
      duration: `${Math.random() * 3 + 2}s`,
    })),
  []);

  return (
    <div className={cn(
      "relative w-full bg-background rounded-2xl border border-border/50 shadow-2xl overflow-hidden flex flex-col",
      // Mobile: compact 180px, desktop: taller
      "min-h-[180px] sm:min-h-[240px] md:min-h-[360px] lg:min-h-[420px]"
    )}>

      {/* Starfield */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {stars.map(star => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white star"
            style={{
              left: star.left,
              top:  star.top,
              width:  star.size,
              height: star.size,
              "--delay":    star.delay,
              "--duration": star.duration,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Mountains — hidden on mobile to save space */}
      <div className={cn("absolute bottom-0 left-0 right-0 h-[80px] md:h-[150px] mountain-bg opacity-40 hidden sm:block", isFlying && "moving")} />
      <div className={cn("absolute bottom-0 left-0 right-0 h-[60px] md:h-[100px] mountain-bg opacity-70 hidden sm:block", isFlying && "moving")} style={{ animationDuration: "10s" }} />

      {/* Top stats */}
      <div className="absolute top-2 left-2 right-2 flex justify-between items-start z-10">
        <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg px-2 py-1 flex items-center gap-1.5">
          <Users className="w-3 h-3 text-success" />
          <span className="font-mono text-xs font-bold">{gameState?.onlineCount || 0}</span>
        </div>
        {gameState?.roundId ? (
          <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg px-2 py-1">
            <span className="text-[10px] font-mono text-muted-foreground">#{gameState.roundId}</span>
          </div>
        ) : null}
      </div>

      {/* Main display — centered */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">

        {/* Multiplier */}
        <motion.h1
          className={cn(
            "font-mono font-black tracking-tighter drop-shadow-2xl transition-colors duration-300",
            "text-5xl sm:text-6xl md:text-8xl lg:text-9xl",
            isCrashed ? "text-destructive" : isFlying ? "text-white" : "text-white/50"
          )}
          animate={isFlying ? { scale: [1, 1.02, 1] } : { scale: 1 }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          {multiplier.toFixed(2)}x
        </motion.h1>

        {/* Crashed */}
        {isCrashed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 bg-destructive/20 text-destructive border border-destructive/30 px-4 py-1 rounded-full font-display font-bold text-sm md:text-xl uppercase tracking-widest"
          >
            Crashed!
          </motion.div>
        )}

        {/* Waiting countdown */}
        {isWaiting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-2 flex flex-col items-center gap-1"
          >
            <div className="text-primary font-display font-bold text-xs md:text-lg uppercase tracking-widest flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Next round starting
            </div>
            {countdownSec > 0 && (
              <span className="font-mono text-3xl md:text-4xl font-black text-white/80 tabular-nums">
                {countdownSec}s
              </span>
            )}
          </motion.div>
        )}
      </div>

      {/* Rocket — hidden on mobile to save space */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none hidden sm:flex">
        <motion.div
          className="relative mt-32 md:mt-48"
          animate={
            isWaiting ? { y: 80, opacity: 1 } :
            isFlying  ? {
              y: [0, -15, 0, -5],
              x: [-2, 2, -1, 3, -2],
              rotate: [-1, 2, -1, 1],
              opacity: 1,
              transition: { repeat: Infinity, duration: 0.5 },
            } :
            { y: 120, opacity: 0, scale: 0.5, rotate: 45 }
          }
          transition={{ type: "spring", stiffness: 100 }}
        >
          <Rocket
            className={cn("w-16 h-16 md:w-24 md:h-24", isCrashed ? "text-destructive" : "text-white")}
            fill="currentColor"
            strokeWidth={1}
          />
          {isFlying && (
            <motion.div
              className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-4 h-8 md:w-6 md:h-12 bg-gradient-to-b from-primary via-warning to-transparent blur-md rounded-full origin-top"
              animate={{ scaleY: [1, 1.5, 0.8, 1.2], opacity: [0.8, 1, 0.6, 0.9] }}
              transition={{ repeat: Infinity, duration: 0.2 }}
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}
