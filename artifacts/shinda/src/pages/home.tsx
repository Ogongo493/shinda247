import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { RightSidebar } from "@/components/layout/right-sidebar";
import { GameCanvas } from "@/components/game/game-canvas";
import { GameControls } from "@/components/game/game-controls";
import { HistoryPanel } from "@/components/game/history-panel";
import { useAuth } from "@/contexts/auth-context";
import { useRtdb } from "@/contexts/rtdb-context";
import { useGetGameState, useGetActivePlayers, getGetGameStateQueryKey, getGetActivePlayersQueryKey } from "@workspace/api-client-react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Home() {
  const { user } = useAuth();
  const { gameState: rtdbGameState, connected, liveBets } = useRtdb();

  const { data: polledGameState } = useGetGameState({
    query: {
      queryKey: getGetGameStateQueryKey(),
      refetchInterval: connected ? false : 500,
      enabled: !connected,
    },
  });

  const gameState = rtdbGameState ?? polledGameState;

  const { data: activePlayers } = useGetActivePlayers({
    query: { queryKey: getGetActivePlayersQueryKey(), refetchInterval: 2000 },
  });

  if (!user) return null;

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-background text-foreground">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <Topbar />

        {/* ── DESKTOP layout (md+): vertical scroll, all sections visible ── */}
        <main className="hidden md:flex flex-1 overflow-y-auto p-4 md:p-5 pb-6 min-h-0">
          <div className="flex flex-col gap-4 max-w-5xl mx-auto w-full">
            <GameCanvas gameState={gameState} />
            <GameControls userId={user.id} gameState={gameState} activePlayers={activePlayers} />
            <HistoryPanel />
          </div>
        </main>

        {/* ── MOBILE layout: natural page flow so testers can scroll to controls/history ── */}
        <div className="flex flex-col md:hidden min-w-0">
          <div className="p-2">
            <GameCanvas gameState={gameState} />
          </div>

          <section aria-label="Place a bet" className="p-2">
            <GameControls userId={user.id} gameState={gameState} activePlayers={activePlayers} />
          </section>

          {/* Live bets remain available below the controls without a separate tab. */}
          <section aria-label="Live bets" className="border-t border-border/30">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold">Live Bets</h2>
              <span className="text-xs text-muted-foreground">({liveBets.length})</span>
            </div>
            {liveBets.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                Waiting for bets…
              </div>
            ) : (
              liveBets.map(bet => (
                <div
                  key={bet.id}
                  className={cn(
                    "flex items-center px-4 py-3 border-b border-border/20",
                    bet.status === "cashed_out" ? "bg-success/5" :
                    bet.status === "lost" ? "bg-destructive/5" : ""
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mr-3",
                    bet.status === "cashed_out" ? "bg-success/20 text-success" :
                    bet.status === "lost" ? "bg-destructive/20 text-destructive" :
                    "bg-primary/20 text-primary"
                  )}>
                    {bet.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{bet.username}</p>
                    <p className="text-xs text-muted-foreground font-mono">KES {bet.amount.toLocaleString()}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {bet.status === "cashed_out" && bet.multiplier !== null ? (
                      <span className="font-mono text-sm font-bold text-success">{bet.multiplier.toFixed(2)}x</span>
                    ) : bet.status === "lost" ? (
                      <span className="font-mono text-sm font-bold text-destructive">lost</span>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" />
                    )}
                  </div>
                </div>
              ))
            )}
          </section>

          <section aria-label="Game history" className="p-2 pb-6">
            <HistoryPanel />
          </section>
        </div>
      </div>

      <RightSidebar />
    </div>
  );
}
