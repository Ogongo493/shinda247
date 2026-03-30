import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "@/lib/firebase";

export type GamePhase = "waiting" | "flying" | "crashed";

export interface GameStatePayload {
  phase: GamePhase;
  multiplier: number;
  crashedAt: number | null;
  roundId: number;
  countdownMs: number | null;
  onlineCount: number;
  playingCount: number;
  flyingStartedAt: number | null;
}

interface RtdbContextValue {
  connected: boolean;
  gameState: GameStatePayload | null;
  smoothMultiplier: number;
}

const RtdbContext = createContext<RtdbContextValue>({
  connected: false,
  gameState: null,
  smoothMultiplier: 1.0,
});

function calcMultiplier(ms: number): number {
  const t = ms / 1000;
  return Math.round((1.0024 ** (t * 100)) * 100) / 100;
}

export function RtdbProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameStatePayload | null>(null);
  const [smoothMultiplier, setSmoothMultiplier] = useState(1.0);
  const rafRef = useRef<number | null>(null);
  const gameStateRef = useRef<GameStatePayload | null>(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // 60fps smooth multiplier interpolation
  useEffect(() => {
    function tick() {
      const gs = gameStateRef.current;
      if (gs?.phase === "flying" && gs.flyingStartedAt != null) {
        const elapsed = Date.now() - gs.flyingStartedAt;
        setSmoothMultiplier(Math.max(1.0, calcMultiplier(elapsed)));
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Subscribe to Firebase Realtime Database
  useEffect(() => {
    const gameStateRef = ref(database, "/game/state");
    const unsubscribe = onValue(
      gameStateRef,
      (snapshot) => {
        const data: GameStatePayload | null = snapshot.val();
        if (!data) return;
        setConnected(true);
        setGameState(data);
        if (data.phase !== "flying") {
          setSmoothMultiplier(data.multiplier ?? 1.0);
        }
      },
      () => {
        setConnected(false);
      },
    );
    return () => unsubscribe();
  }, []);

  return (
    <RtdbContext.Provider value={{ connected, gameState, smoothMultiplier }}>
      {children}
    </RtdbContext.Provider>
  );
}

export function useRtdb() {
  return useContext(RtdbContext);
}
