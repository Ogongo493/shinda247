import { useState } from "react";
import { Users, Trophy } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { useGetLeaderboard, getGetLeaderboardQueryKey } from "@workspace/api-client-react";
import { useRtdb } from "@/contexts/rtdb-context";

export function RightSidebar() {
  const [tab, setTab] = useState<"live" | "top">("live");
  const { liveBets } = useRtdb();
  const { data: leaderboard } = useGetLeaderboard({ query: { queryKey: getGetLeaderboardQueryKey(), refetchInterval: 10000 } });

  const cashedOut = liveBets.filter(b => b.status === "cashed_out");
  const active = liveBets.filter(b => b.status === "active");
  const lost = liveBets.filter(b => b.status === "lost");
  const sorted = [...cashedOut, ...active, ...lost];

  return (
    <aside className="w-64 h-full hidden lg:flex flex-col bg-card border-l border-border/50 z-20">

      {/* Tab headers */}
      <div className="flex border-b border-border/50 shrink-0">
        <button
          onClick={() => setTab("live")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-4 text-xs font-bold uppercase tracking-widest transition-colors relative",
            tab === "live" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Users className="w-4 h-4" />
          Live Bets
          {liveBets.length > 0 && (
            <span className="ml-1 bg-primary/20 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {liveBets.length}
            </span>
          )}
          {tab === "live" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_8px_rgba(255,107,0,0.8)]" />
          )}
        </button>
        <button
          onClick={() => setTab("top")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-4 text-xs font-bold uppercase tracking-widest transition-colors relative",
            tab === "top" ? "text-warning" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Trophy className="w-4 h-4" />
          Top Wins
          {tab === "top" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-warning shadow-[0_0_8px_rgba(234,179,8,0.8)]" />
          )}
        </button>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/30 shrink-0">
        <div className="flex-1">Player</div>
        <div className="w-16 text-right">Bet</div>
        <div className="w-20 text-right">Cashout</div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === "live" ? (
          sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Users className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-sm">Waiting for bets…</p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {sorted.map(bet => (
                <div
                  key={bet.id}
                  className={cn(
                    "flex items-center px-3 py-2.5 transition-colors",
                    bet.status === "cashed_out" ? "bg-success/5 hover:bg-success/10" :
                    bet.status === "lost" ? "bg-destructive/5 hover:bg-destructive/10" :
                    "hover:bg-secondary/30"
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mr-2",
                    bet.status === "cashed_out" ? "bg-success/20 text-success" :
                    bet.status === "lost" ? "bg-destructive/20 text-destructive" :
                    "bg-primary/20 text-primary"
                  )}>
                    {bet.username[0].toUpperCase()}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate leading-tight">{bet.username}</p>
                  </div>

                  {/* Bet amount */}
                  <div className="w-16 text-right">
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatCurrency(bet.amount)}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="w-20 text-right">
                    {bet.status === "cashed_out" && bet.multiplier !== null ? (
                      <span className="font-mono text-xs font-bold text-success">
                        {bet.multiplier.toFixed(2)}x
                      </span>
                    ) : bet.status === "lost" ? (
                      <span className="font-mono text-xs font-bold text-destructive">
                        lost
                      </span>
                    ) : (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          leaderboard && leaderboard.length > 0 ? (
            <div className="divide-y divide-border/20">
              {leaderboard.map((player, i) => (
                <div
                  key={i}
                  className="flex items-center px-3 py-2.5 hover:bg-secondary/30 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-warning/20 flex items-center justify-center text-[11px] font-bold text-warning shrink-0 mr-2">
                    {player.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{player.username}</p>
                  </div>
                  <div className="w-16 text-right font-mono text-xs text-muted-foreground">
                    {formatCurrency(player.amount)}
                  </div>
                  <div className="w-20 text-right font-mono text-xs font-bold text-success">
                    {player.multiplier.toFixed(2)}x
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Trophy className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-sm">No wins yet</p>
            </div>
          )
        )}
      </div>
    </aside>
  );
}
