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

export interface LiveBet {
  id: string;
  username: string;
  amount: number;
  isBot: boolean;
  status: "active" | "cashed_out" | "lost";
  multiplier: number | null;
}

interface RtdbContextValue {
  connected: boolean;
  gameState: GameStatePayload | null;
  smoothMultiplier: number;
  countdownMs: number;
  liveBets: LiveBet[];
}

const RtdbContext = createContext<RtdbContextValue>({
  connected: false,
  gameState: null,
  smoothMultiplier: 1.0,
  countdownMs: 0,
  liveBets: [],
});

function calcMultiplier(ms: number): number {
  return Math.round(Math.exp(ms / 35000) * 100) / 100;
}

export function RtdbProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameStatePayload | null>(null);
  const [smoothMultiplier, setSmoothMultiplier] = useState(1.0);
  const [countdownMs, setCountdownMs] = useState(0);
  const [liveBets, setLiveBets] = useState<LiveBet[]>([]);

  const rafRef = useRef<number | null>(null);
  const gameStateRef = useRef<GameStatePayload | null>(null);
  const lastCountdownRef = useRef<{ value: number; receivedAt: number } | null>(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // 60fps loop: smooth multiplier + smooth countdown
  useEffect(() => {
    function tick() {
      const gs = gameStateRef.current;

      if (gs?.phase === "flying" && gs.flyingStartedAt != null) {
        const elapsed = Date.now() - gs.flyingStartedAt;
        setSmoothMultiplier(Math.max(1.0, calcMultiplier(elapsed)));
      }

      if (gs?.phase === "waiting" && lastCountdownRef.current) {
        const elapsed = Date.now() - lastCountdownRef.current.receivedAt;
        const remaining = Math.max(0, lastCountdownRef.current.value - elapsed);
        setCountdownMs(remaining);
      }

      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Load initial players (for mid-round joins)
  useEffect(() => {
    fetch("/api/players")
      .then(r => r.json())
      .then((players: any[]) => {
        if (!Array.isArray(players) || players.length === 0) return;
        setLiveBets(players.map(p => ({
          id: String(p.id),
          username: p.username,
          amount: p.amount,
          isBot: String(p.id).startsWith("bot-"),
          status: p.cashedOut ? "cashed_out" : "active",
          multiplier: p.multiplier ?? null,
        })));
      })
      .catch(() => {});
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
      if (data.phase === "waiting" && data.countdownMs != null) {
        lastCountdownRef.current = { value: data.countdownMs, receivedAt: Date.now() };
      }
    });

    socket.on("game:crash", (data: GameStatePayload) => {
      setGameState(data);
      setSmoothMultiplier(data.multiplier ?? 1.0);
      setCountdownMs(0);
      // Mark all active bets as lost
      setLiveBets(prev => prev.map(b =>
        b.status === "active" ? { ...b, status: "lost" } : b
      ));
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
      if (data.countdownMs != null) {
        lastCountdownRef.current = { value: data.countdownMs, receivedAt: Date.now() };
        setCountdownMs(data.countdownMs);
      }
      // Clear bets for new round
      setLiveBets([]);
    });

    // Normalized bet event: { playerId, username, amount, isBot }
    socket.on("game:bet", (data: { playerId: string; username: string; amount: number; isBot: boolean }) => {
      setLiveBets(prev => {
        if (prev.find(b => b.id === data.playerId)) return prev;
        const newBet: LiveBet = {
          id: data.playerId,
          username: data.username,
          amount: data.amount,
          isBot: data.isBot,
          status: "active",
          multiplier: null,
        };
        return [newBet, ...prev];
      });
    });

    // Normalized cashout event: { playerId, username, multiplier, amount, isBot }
    socket.on("game:cashout", (data: { playerId: string; username: string; multiplier: number; amount: number; isBot: boolean }) => {
      setLiveBets(prev => prev.map(b =>
        b.id === data.playerId
          ? { ...b, status: "cashed_out", multiplier: data.multiplier }
          : b
      ));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <RtdbContext.Provider value={{ connected, gameState, smoothMultiplier, countdownMs, liveBets }}>
      {children}
    </RtdbContext.Provider>
  );
}

export function useRtdb() {
  return useContext(RtdbContext);
}
