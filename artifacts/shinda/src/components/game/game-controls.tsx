import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hash, Settings2 } from "lucide-react";
import type { GameState, ActivePlayer } from "@workspace/api-client-react";
import { usePlaceBet, useCashOut } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useRtdb } from "@/contexts/rtdb-context";

const MIN_BET = 10;
const MAX_BET = 3_000;

interface GameControlsProps {
  userId: number;
  gameState?: GameState;
  activePlayers?: ActivePlayer[];
}

export function GameControls({ userId, gameState, activePlayers }: GameControlsProps) {
  const [amount,       setAmount]       = useState<string>("100");
  const [autoCash,     setAutoCash]     = useState<string>("2.00");
  const [currentBetId, setCurrentBetId] = useState<number | null>(null);
  const prevRoundId = useRef<number | null>(null);
  const { toast } = useToast();
  const { smoothMultiplier } = useRtdb();

  const placeBetMutation = usePlaceBet();
  const cashOutMutation  = useCashOut();

  const phase    = gameState?.phase || "waiting";
  const roundId  = gameState?.roundId ?? null;
  const playerId = String(userId);
  const me        = activePlayers?.find(p => p.id === playerId);
  const hasBet    = !!me || currentBetId !== null;
  const cashedOut = me?.cashedOut ?? false;
  const canCashOut = hasBet && !cashedOut && phase === "flying" && currentBetId !== null;

  useEffect(() => {
    if (roundId !== null && roundId !== prevRoundId.current && phase === "waiting") {
      prevRoundId.current = roundId;
      setCurrentBetId(null);
    }
  }, [roundId, phase]);

  function validateAmount(): boolean {
    const val = parseFloat(amount);
    if (isNaN(val) || val < MIN_BET) {
      toast({ title: "Invalid Amount", description: `Minimum bet is KES ${MIN_BET}`, variant: "destructive" });
      return false;
    }
    if (val > MAX_BET) {
      toast({ title: "Invalid Amount", description: `Maximum bet is KES ${MAX_BET.toLocaleString()}`, variant: "destructive" });
      return false;
    }
    return true;
  }

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
          },
          onError: (err: any) => {
            const msg = err?.data?.error ?? err?.message ?? "Cashout failed";
            toast({ title: "Cashout Error", description: msg, variant: "destructive" });
          },
        }
      );
    } else if (phase === "waiting" && !hasBet) {
      if (!validateAmount()) return;
      const autoCashOutVal = parseFloat(autoCash);
      placeBetMutation.mutate(
        {
          data: {
            amount: parseFloat(amount),
            autoCashOut: (!isNaN(autoCashOutVal) && autoCashOutVal >= 1.01) ? autoCashOutVal : null,
            playerId,
          },
        },
        {
          onSuccess: (res) => {
            setCurrentBetId(res.betId);
            toast({ title: "Bet Placed!", description: `KES ${amount} placed. Good luck!` });
          },
          onError: (err: any) => {
            const msg = err?.data?.error ?? err?.message ?? "Failed to place bet";
            toast({ title: "Bet Failed", description: msg, variant: "destructive" });
          },
        }
      );
    }
  };

  const isPending = placeBetMutation.isPending || cashOutMutation.isPending;
  const betAmt    = parseFloat(amount || "0") || 0;
  const liveWin   = (smoothMultiplier * betAmt).toFixed(2);

  return (
    <div className="w-full bg-card rounded-2xl border border-border/50 p-3 sm:p-4 md:p-5 shadow-xl flex flex-col gap-3 shrink-0">

      {/* ── Bet Amount + Auto Cashout ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">

        {/* Bet Amount */}
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> Bet (KES)</span>
            <span className="text-[10px] font-normal normal-case text-muted-foreground/60">Min {MIN_BET} · Max {MAX_BET.toLocaleString()}</span>
          </label>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={MIN_BET}
            max={MAX_BET}
            disabled={hasBet || phase !== "waiting"}
            className="text-lg h-12 bg-background"
          />
          {/* Quick-pick: 2 rows of 3 on mobile, 1 row of 6 on sm+ */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {[10, 50, 100, 500, 1000, 3000].map(val => (
              <button
                key={val}
                onClick={() => setAmount(val.toString())}
                disabled={hasBet || phase !== "waiting"}
                className="py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-xs font-mono font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                {val >= 1000 ? `${val / 1000}k` : val}
              </button>
            ))}
          </div>
        </div>

        {/* Auto Cash Out */}
        <div className="flex-1 sm:max-w-[160px] space-y-1.5">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Settings2 className="w-3 h-3" /> Auto (×)
          </label>
          <Input
            type="number"
            step="0.01"
            min="1.01"
            value={autoCash}
            onChange={(e) => setAutoCash(e.target.value)}
            disabled={hasBet || phase !== "waiting"}
            className="text-lg h-12 bg-background"
          />
          <div className="grid grid-cols-4 gap-1.5">
            {[1.5, 2, 5, 10].map(val => (
              <button
                key={val}
                onClick={() => setAutoCash(val.toFixed(2))}
                disabled={hasBet || phase !== "waiting"}
                className="py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-xs font-mono font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                {val}×
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Action Button ─────────────────────────────────────────────── */}
      {canCashOut ? (
        <Button
          size="xl"
          variant="success"
          className="w-full h-16 sm:h-20 text-xl sm:text-2xl"
          onClick={handleAction}
          disabled={isPending}
        >
          {isPending ? "CASHING OUT…" : `CASH OUT  KES ${liveWin}`}
        </Button>
      ) : phase === "waiting" ? (
        <Button
          size="xl"
          className="w-full h-16 sm:h-20 text-xl sm:text-2xl"
          onClick={handleAction}
          disabled={hasBet || isPending}
        >
          {isPending ? "PLACING BET…" : hasBet ? "BET PLACED ✓" : "PLACE BET"}
        </Button>
      ) : phase === "flying" && hasBet ? (
        <Button
          size="xl"
          variant="success"
          className="w-full h-14 sm:h-16 text-base sm:text-xl opacity-60"
          disabled
        >
          AUTO CASHOUT SET ✓
        </Button>
      ) : (
        <Button
          size="xl"
          variant="secondary"
          className="w-full h-14 sm:h-16 text-base sm:text-xl text-muted-foreground"
          disabled
        >
          WAIT FOR NEXT ROUND
        </Button>
      )}
    </div>
  );
}
