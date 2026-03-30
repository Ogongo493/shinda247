import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hash, Settings2 } from "lucide-react";
import type { GameState, ActivePlayer } from "@workspace/api-client-react";
import { usePlaceBet, useCashOut } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useRtdb } from "@/contexts/rtdb-context";

interface GameControlsProps {
  userId: number;
  gameState?: GameState;
  activePlayers?: ActivePlayer[];
}

export function GameControls({ userId, gameState, activePlayers }: GameControlsProps) {
  const [amount, setAmount] = useState<string>("500");
  const [autoCash, setAutoCash] = useState<string>("4.3");
  const [currentBetId, setCurrentBetId] = useState<number | null>(null);
  const prevRoundId = useRef<number | null>(null);
  const { toast } = useToast();
  const { smoothMultiplier } = useRtdb();

  const placeBetMutation = usePlaceBet();
  const cashOutMutation = useCashOut();

  const phase = gameState?.phase || "waiting";
  const roundId = gameState?.roundId ?? null;
  const playerId = String(userId);
  const me = activePlayers?.find(p => p.id === playerId);
  const hasBet = !!me || currentBetId !== null;
  const cashedOut = me?.cashedOut ?? false;
  const canCashOut = hasBet && !cashedOut && phase === "flying" && currentBetId !== null;

  useEffect(() => {
    if (roundId !== null && roundId !== prevRoundId.current && phase === "waiting") {
      prevRoundId.current = roundId;
      setCurrentBetId(null);
    }
  }, [roundId, phase]);

  const handleAction = () => {
    if (canCashOut && currentBetId !== null) {
      cashOutMutation.mutate(
        { data: { betId: currentBetId, playerId } },
        {
          onSuccess: (res) => {
            setCurrentBetId(null);
            if (res.success) {
              toast({ title: "Cashed Out!", description: `Won KES ${res.profit.toFixed(2)} at ${res.multiplier.toFixed(2)}x` });
            }
          }
        }
      );
    } else if (phase === "waiting" && !hasBet) {
      placeBetMutation.mutate(
        { data: { amount: parseFloat(amount), autoCashOut: parseFloat(autoCash) || null, playerId } },
        {
          onSuccess: (res) => {
            setCurrentBetId(res.betId);
            toast({ title: "Bet Placed!", description: `KES ${amount} bet placed. Good luck!` });
          },
          onError: (err: any) => toast({ title: "Error", description: err?.error || "Failed to place bet", variant: "destructive" })
        }
      );
    }
  };

  const isPending = placeBetMutation.isPending || cashOutMutation.isPending;
  const liveWin = (smoothMultiplier * parseFloat(amount || "0")).toFixed(2);

  return (
    <div className="w-full bg-card rounded-2xl border border-border/50 p-4 md:p-6 shadow-xl flex flex-col md:flex-row gap-4 lg:gap-8 shrink-0">

      <div className="flex-1 flex gap-4">
        <div className="flex-1 space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1 flex items-center gap-1">
            <Hash className="w-3 h-3" /> Bet Amount (KES)
          </label>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={hasBet || phase !== "waiting"}
            className="text-lg h-14 bg-background"
          />
          <div className="flex gap-2">
            {[100, 500, 1000, 5000].map(val => (
              <button
                key={val}
                onClick={() => setAmount(val.toString())}
                disabled={hasBet || phase !== "waiting"}
                className="flex-1 py-1.5 bg-secondary hover:bg-secondary/80 rounded-md text-xs font-mono font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                +{val}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1 flex items-center gap-1">
            <Settings2 className="w-3 h-3" /> Auto Cash Out (X)
          </label>
          <Input
            type="number"
            step="0.01"
            value={autoCash}
            onChange={(e) => setAutoCash(e.target.value)}
            disabled={hasBet || phase !== "waiting"}
            className="text-lg h-14 bg-background"
          />
        </div>
      </div>

      <div className="w-full md:w-[300px] flex items-end">
        {canCashOut ? (
          <Button
            size="xl"
            variant="success"
            className="w-full h-20 text-2xl"
            onClick={handleAction}
            disabled={isPending}
          >
            {isPending ? "CASHING OUT..." : `CASH OUT KES ${liveWin}`}
          </Button>
        ) : phase === "waiting" ? (
          <Button
            size="xl"
            className="w-full h-20 text-2xl"
            onClick={handleAction}
            disabled={hasBet || isPending}
          >
            {isPending ? "PLACING BET..." : hasBet ? "BET PLACED ✓" : "PLACE BET"}
          </Button>
        ) : phase === "flying" && hasBet ? (
          <Button
            size="xl"
            variant="success"
            className="w-full h-20 text-xl opacity-50"
            disabled
          >
            AUTO CASHOUT SET ✓
          </Button>
        ) : (
          <Button
            size="xl"
            variant="secondary"
            className="w-full h-20 text-xl text-muted-foreground"
            disabled
          >
            WAIT FOR NEXT ROUND
          </Button>
        )}
      </div>
    </div>
  );
}
