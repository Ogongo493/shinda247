import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { RightSidebar } from "@/components/layout/right-sidebar";
import { GameCanvas } from "@/components/game/game-canvas";
import { GameControls } from "@/components/game/game-controls";
import { HistoryPanel } from "@/components/game/history-panel";
import { useAuth } from "@/contexts/auth-context";
import { useRtdb } from "@/contexts/rtdb-context";
import { useGetGameState, useGetActivePlayers, getGetGameStateQueryKey, getGetActivePlayersQueryKey } from "@workspace/api-client-react";
import { History, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Home() {
  const { user } = useAuth();
  const { gameState: rtdbGameState, connected, liveBets } = useRtdb();
  const [mobileTab, setMobileTab] = useState<"game" | "bets" | "history">("game");

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
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative z-10">
        <Topbar />

        {/* ── DESKTOP layout (md+): vertical scroll, all sections visible ── */}
        <main className="hidden md:flex flex-1 overflow-y-auto p-4 md:p-5 pb-6 min-h-0">
          <div className="flex flex-col gap-4 max-w-5xl mx-auto w-full">
            <GameCanvas gameState={gameState} />
            <GameControls userId={user.id} gameState={gameState} activePlayers={activePlayers} />
            <HistoryPanel />
          </div>
        </main>

        {/* ── MOBILE layout (below md): fixed canvas + controls, tab bar for history/bets ── */}
        <div className="flex flex-col md:hidden flex-1 min-h-0 overflow-hidden">

          {/* Game canvas — compact, fixed, always showing */}
          <div className="shrink-0 p-2">
            <GameCanvas gameState={gameState} />
          </div>

          {/* Mobile tab switcher */}
          <div className="shrink-0 flex border-b border-border/50 bg-card px-2">
            <button
              onClick={() => setMobileTab("game")}
              className={cn(
                "flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors relative",
                mobileTab === "game" ? "text-primary" : "text-muted-foreground"
              )}
            >
              Bet
              {mobileTab === "game" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
            </button>
            <button
              onClick={() => setMobileTab("bets")}
              className={cn(
                "flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors relative flex items-center justify-center gap-1",
                mobileTab === "bets" ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Users className="w-3.5 h-3.5" />
              Live
              {liveBets.length > 0 && (
                <span className="bg-primary/20 text-primary text-[9px] font-bold px-1 rounded-full">
                  {liveBets.length}
                </span>
              )}
              {mobileTab === "bets" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
            </button>
            <button
              onClick={() => setMobileTab("history")}
              className={cn(
                "flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors relative flex items-center justify-center gap-1",
                mobileTab === "history" ? "text-primary" : "text-muted-foreground"
              )}
            >
              <History className="w-3.5 h-3.5" />
              History
              {mobileTab === "history" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
            </button>
          </div>

          {/* Tab content — scrollable */}
          <div className="flex-1 overflow-y-auto min-h-0 pb-20">

            {/* BET tab */}
            {mobileTab === "game" && (
              <div className="p-2">
                <GameControls userId={user.id} gameState={gameState} activePlayers={activePlayers} />
              </div>
            )}

            {/* LIVE BETS tab */}
            {mobileTab === "bets" && (
              <div className="divide-y divide-border/20">
                {liveBets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Users className="w-10 h-10 mb-3 opacity-20" />
                    <p className="text-sm">Waiting for bets…</p>
                  </div>
                ) : (
                  liveBets.map(bet => (
                    <div
                      key={bet.id}
                      className={cn(
                        "flex items-center px-4 py-3",
                        bet.status === "cashed_out" ? "bg-success/5" :
                        bet.status === "lost"        ? "bg-destructive/5" : ""
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mr-3",
                        bet.status === "cashed_out" ? "bg-success/20 text-success" :
                        bet.status === "lost"        ? "bg-destructive/20 text-destructive" :
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
              </div>
            )}

            {/* HISTORY tab */}
            {mobileTab === "history" && (
              <div className="p-2">
                <HistoryPanel />
              </div>
            )}
          </div>
        </div>
      </div>

      <RightSidebar />
    </div>
  );
}
