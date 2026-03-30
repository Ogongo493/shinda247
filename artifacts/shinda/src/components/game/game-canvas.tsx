import { motion } from "framer-motion";
import { Rocket, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRtdb } from "@/contexts/rtdb-context";
import type { GameState } from "@workspace/api-client-react";

interface GameCanvasProps {
  gameState?: GameState;
}

export function GameCanvas({ gameState }: GameCanvasProps) {
  const { smoothMultiplier } = useRtdb();
  const phase = gameState?.phase || "waiting";
  const multiplier = phase === "flying" ? smoothMultiplier : (gameState?.multiplier || 1.0);
  const isCrashed = phase === "crashed";
  const isFlying = phase === "flying";
  
  // Create static stars once
  const stars = Array.from({ length: 50 }).map((_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: Math.random() * 2 + 1 + "px",
    delay: `${Math.random() * 3}s`,
    duration: `${Math.random() * 3 + 2}s`
  }));

  return (
    <div className="relative w-full h-full min-h-[350px] md:min-h-[450px] bg-background rounded-2xl border border-border/50 shadow-2xl overflow-hidden flex flex-col">
      
      {/* Starfield Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {stars.map(star => (
          <div 
            key={star.id}
            className="absolute rounded-full bg-white star"
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              "--delay": star.delay,
              "--duration": star.duration,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Moving Mountains */}
      <div className={cn("absolute bottom-0 left-0 right-0 h-[150px] mountain-bg opacity-40", isFlying && "moving")} />
      <div className={cn("absolute bottom-0 left-0 right-0 h-[100px] mountain-bg opacity-70", isFlying && "moving")} style={{ animationDuration: '10s' }} />

      {/* Top Stats Bar */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10">
        <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg p-3 shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Win Jackpot</span>
          </div>
          <div className="font-mono font-bold text-primary">KES 50,420.00</div>
        </div>

        <div className="flex gap-2">
          <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <Users className="w-4 h-4 text-success" />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase text-muted-foreground font-bold">Online</span>
              <span className="font-mono text-xs font-bold leading-none">{gameState?.onlineCount || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Multiplier Display */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none mt-10">
        <motion.h1 
          className={cn(
            "font-mono text-7xl md:text-9xl font-black tracking-tighter drop-shadow-2xl transition-colors duration-300",
            isCrashed ? "text-destructive" : isFlying ? "text-white" : "text-white/50"
          )}
          animate={isFlying ? { scale: [1, 1.02, 1] } : { scale: 1 }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          {multiplier.toFixed(2)}x
        </motion.h1>
        
        {isCrashed && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 bg-destructive/20 text-destructive border border-destructive/30 px-6 py-2 rounded-full font-display font-bold text-xl uppercase tracking-widest shadow-[0_0_30px_rgba(239,68,68,0.3)]"
          >
            Crashed
          </motion.div>
        )}
        
        {phase === "waiting" && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-primary font-display font-bold text-xl uppercase tracking-widest flex items-center gap-2"
          >
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Waiting for next round
          </motion.div>
        )}
      </div>

      {/* Animated Rocket */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          className="relative mt-48"
          animate={
            phase === "waiting" ? { y: 100, opacity: 1 } :
            phase === "flying" ? { 
              y: [0, -15, 0, -5], 
              x: [-2, 2, -1, 3, -2],
              rotate: [-1, 2, -1, 1],
              opacity: 1,
              transition: { repeat: Infinity, duration: 0.5 }
            } :
            { y: 150, opacity: 0, scale: 0.5, rotate: 45 }
          }
          transition={{ type: "spring", stiffness: 100 }}
        >
          <div className="relative">
            <Rocket className={cn("w-20 h-20 md:w-24 md:h-24", isCrashed ? "text-destructive" : "text-white")} fill="currentColor" strokeWidth={1} />
            
            {/* Flames */}
            {isFlying && (
              <motion.div 
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-6 h-12 bg-gradient-to-b from-primary via-warning to-transparent blur-md rounded-full origin-top"
                animate={{ 
                  scaleY: [1, 1.5, 0.8, 1.2],
                  opacity: [0.8, 1, 0.6, 0.9]
                }}
                transition={{ repeat: Infinity, duration: 0.2 }}
              />
            )}
          </div>
        </motion.div>
      </div>
      
    </div>
  );
}
