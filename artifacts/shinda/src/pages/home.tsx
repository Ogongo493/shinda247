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
  const { gameState: rtdbGameState, connected } = useRtdb();

  // Fall back to polling if RTDB not connected yet
  const { data: polledGameState } = useGetGameState({
    query: {
      queryKey: getGetGameStateQueryKey(),
      refetchInterval: connected ? false : 500,
      enabled: !connected,
    },
  });

  const gameState = rtdbGameState ?? polledGameState;

  const { data: activePlayers } = useGetActivePlayers({ query: { queryKey: getGetActivePlayersQueryKey(), refetchInterval: 2000 } });

  if (!user) return null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative z-10">
        <Topbar />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
            <GameCanvas gameState={gameState} />

            <GameControls
              userId={user.id}
              gameState={gameState}
              activePlayers={activePlayers}
            />

            <HistoryPanel />
          </div>

          <div className="h-12" />
        </main>
      </div>

      <RightSidebar />
    </div>
  );
}
