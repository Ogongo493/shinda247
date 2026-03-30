import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";

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
  return Math.round(Math.exp(ms / 35000) * 100) / 100;
}

export function RtdbProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameStatePayload | null>(null);
  const [smoothMultiplier, setSmoothMultiplier] = useState(1.0);
  const rafRef = useRef<number | null>(null);
  const gameStateRef = useRef<GameStatePayload | null>(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

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

  useEffect(() => {
    const socket = io("/", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("game:state", (data: GameStatePayload) => {
      setGameState(data);
      if (data.phase !== "flying") {
        setSmoothMultiplier(data.multiplier ?? 1.0);
      }
    });

    socket.on("game:crash", (data: GameStatePayload) => {
      setGameState(data);
      setSmoothMultiplier(data.multiplier ?? 1.0);
    });

    socket.on("game:newRound", (data: Partial<GameStatePayload>) => {
      setGameState(prev => ({
        ...(prev ?? { multiplier: 1.0, crashedAt: null, onlineCount: 0, playingCount: 0 }),
        phase: "waiting",
        roundId: data.roundId ?? prev?.roundId ?? 0,
        countdownMs: data.countdownMs ?? 7000,
        multiplier: 1.0,
        crashedAt: null,
        flyingStartedAt: null,
      }));
      setSmoothMultiplier(1.0);
    });

    return () => {
      socket.disconnect();
    };
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
