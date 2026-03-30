import { Trophy, Shield } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { useGetLeaderboard } from "@workspace/api-client-react";

export function RightSidebar() {
  const { data: leaderboard } = useGetLeaderboard({ query: { refetchInterval: 5000 } });

  return (
    <aside className="w-80 h-full hidden xl:flex flex-col bg-card border-l border-border/50 z-20">
      <div className="h-20 flex items-center justify-between px-6 border-b border-border/50">
        <h2 className="font-display font-bold text-lg flex items-center gap-2">
          <Trophy className="w-5 h-5 text-warning" />
          LEADERBOARD
        </h2>
        <Shield className="w-5 h-5 text-muted-foreground/50" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <div className="flex text-xs font-bold text-muted-foreground uppercase tracking-wider px-2 pb-2">
          <div className="flex-1">Player</div>
          <div className="w-16 text-right">Cashout</div>
          <div className="w-24 text-right">Amount</div>
        </div>

        {leaderboard?.map((player, i) => (
          <div 
            key={i} 
            className="flex items-center px-3 py-3 rounded-xl bg-secondary/30 border border-border/30 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                {player.username.substring(0,1)}
              </div>
              <span className="font-medium text-sm truncate">{player.username}</span>
            </div>
            
            <div className="w-16 text-right font-mono text-sm font-bold text-success">
              {player.multiplier.toFixed(2)}x
            </div>
            
            <div className="w-24 text-right font-mono text-sm font-bold text-foreground">
              {formatCurrency(player.amount)}
            </div>
          </div>
        ))}

        {(!leaderboard || leaderboard.length === 0) && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Trophy className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-sm">No big wins yet</p>
          </div>
        )}
      </div>
    </aside>
  );
}
