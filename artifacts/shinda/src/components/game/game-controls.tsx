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
  const [autoBet,      setAutoBet]      = useState(false);
  const autoBetRound = useRef<number | null>(null);
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
  const activeBetId = me?.betId ?? currentBetId;
  const hasBet    = !!me || currentBetId !== null;
  const cashedOut = me?.cashedOut ?? false;
  const canCashOut = hasBet && !cashedOut && phase === "flying" && activeBetId !== null;

  useEffect(() => {
    if (roundId !== null && roundId !== prevRoundId.current && phase === "waiting") {
      prevRoundId.current = roundId;
      setCurrentBetId(null);
    }
  }, [roundId, phase]);

  useEffect(() => {
    if (!autoBet || phase !== "waiting" || roundId === null || hasBet || placeBetMutation.isPending) return;
    if (autoBetRound.current === roundId) return;
    const val = parseFloat(amount);
    if (!Number.isFinite(val) || val < MIN_BET || val > MAX_BET) return;
    autoBetRound.current = roundId;
    const cashTarget = parseFloat(autoCash);
    placeBetMutation.mutate(
      { data: { amount: val, autoCashOut: Number.isFinite(cashTarget) && cashTarget >= 1.01 ? cashTarget : null, playerId } },
      {
        onSuccess: (res) => {
          setCurrentBetId(res.betId);
          toast({ title: "Auto Bet Placed", description: "KES " + val + " placed for this round." });
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? err?.message ?? "Automatic bet failed";
          toast({ title: "Auto Bet Failed", description: msg, variant: "destructive" });
        },
      }
    );
  }, [autoBet, phase, roundId, hasBet, placeBetMutation.isPending, amount, autoCash, playerId]);

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
    if (canCashOut && activeBetId !== null) {
      cashOutMutation.mutate(
        { data: { betId: activeBetId, playerId } },
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

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> Amount (KES)</span>
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
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Settings2 className="w-3 h-3" /> Auto Cashout (×)
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
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/50 px-3 py-3">
        <div className="min-w-0">
          <label htmlFor="auto-bet-toggle" className="text-sm font-semibold cursor-pointer">Auto Bet</label>
          <p className="text-xs text-muted-foreground">Automatically bet each round until switched off</p>
        </div>
        <button
          id="auto-bet-toggle"
          type="button"
          role="switch"
          aria-checked={autoBet}
          aria-label="Auto Bet"
          onClick={() => setAutoBet((enabled) => !enabled)}
          className={"relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " + (autoBet ? "bg-primary" : "bg-secondary")}
        >
          <span className={"absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform " + (autoBet ? "translate-x-6" : "translate-x-1")} />
        </button>
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
