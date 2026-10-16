import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { RightSidebar } from "@/components/layout/right-sidebar";
import { GameCanvas } from "@/components/game/game-canvas";
import { GameControls } from "@/components/game/game-controls";
import { HistoryPanel } from "@/components/game/history-panel";
import { useAuth } from "@/contexts/auth-context";
import { useRtdb } from "@/contexts/rtdb-context";
import { useGetGameState, useGetActivePlayers, getGetGameStateQueryKey, getGetActivePlayersQueryKey } from "@workspace/api-client-react";

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
    <div className="flex min-h-screen md:h-screen w-full overflow-x-hidden md:overflow-hidden bg-background text-foreground">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 min-h-screen md:h-full md:overflow-hidden relative z-10">
        <Topbar />

        {/* ── DESKTOP layout (md+): vertical scroll, all sections visible ── */}
        <main className="hidden md:flex flex-1 overflow-y-auto p-4 md:p-5 pb-6 min-h-0">
          <div className="flex flex-col gap-4 max-w-5xl mx-auto w-full">
            <GameCanvas gameState={gameState} />
            <GameControls userId={user.id} gameState={gameState} activePlayers={activePlayers} />
            <HistoryPanel />
          </div>
        </main>

        {/* ── MOBILE layout (below md): natural page scrolling ── */}
        <div className="flex flex-col md:hidden flex-1">
          <div className="shrink-0 p-2">
            <GameCanvas gameState={gameState} />
          </div>

          <section aria-label="Place a bet" className="p-2">
            <GameControls userId={user.id} gameState={gameState} activePlayers={activePlayers} />
          </section>

          <section aria-label="Round history" className="p-2">
            <HistoryPanel />
          </section>

          {liveBets.length > 0 && (
            <section aria-label="Live bets" className="px-2 pb-4">
              <div className="rounded-xl border border-border/50 bg-card">
                <div className="px-3 py-2 border-b border-border/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Live bets ({liveBets.length})
                </div>
                {liveBets.map(bet => (
                  <div key={bet.id} className="flex items-center px-3 py-2 border-b border-border/20 last:border-0">
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
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <RightSidebar />
    </div>
  );
}
