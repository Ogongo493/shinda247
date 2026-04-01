import { useState, useEffect } from "react";
import { Wallet, Plus, Minus, Zap, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, cn } from "@/lib/utils";
import { useGetGameHistory, getGetGameHistoryQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { DepositModal, WithdrawModal } from "@/components/wallet/wallet-modals";

export function Topbar() {
  const { user, token, logout } = useAuth();
  const [, navigate] = useLocation();
  const [balance, setBalance] = useState<number>(0);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  useEffect(() => {
    if (!user || !token) return;
    const fetchWallet = async () => {
      try {
        const res = await fetch(`/api/wallet`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setBalance(data.balance ?? 0);
        }
      } catch {}
    };
    fetchWallet();
    const iv = setInterval(fetchWallet, 3000);
    return () => clearInterval(iv);
  }, [user, token]);

  const { data: history } = useGetGameHistory({ limit: 8 }, { query: { queryKey: getGetGameHistoryQueryKey({ limit: 8 }), refetchInterval: 5000 } });

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const avatarLetter = user?.username?.charAt(0).toUpperCase() ?? "?";

  return (
    <>
      <header className="h-20 w-full bg-card border-b border-border/50 flex items-center justify-between px-4 md:px-6 z-20 shrink-0">

        {/* User Profile & Wallet */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary/50 shadow-[0_0_10px_rgba(255,107,0,0.2)] flex items-center justify-center bg-primary/10 text-primary font-bold text-lg font-display">
              {avatarLetter}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-foreground font-display uppercase">{user?.username ?? "—"}</p>
              <p className="text-xs text-muted-foreground">ID: {user?.id ?? "—"}</p>
            </div>
          </div>

          <div className="h-10 w-px bg-border/50 hidden sm:block mx-1" />

          <div className="flex items-center bg-background rounded-xl p-1 pr-4 border border-border/50">
            <div className="bg-secondary p-2 rounded-lg mr-3">
              <Wallet className="w-4 h-4 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider leading-none">Balance</span>
              <span className="font-mono font-bold text-sm text-foreground">
                KES {formatCurrency(balance)}
              </span>
            </div>
          </div>

          <Button size="sm" className="hidden md:flex gap-1.5" onClick={() => setDepositOpen(true)}>
            <Plus className="w-4 h-4" />
            DEPOSIT
          </Button>
          <Button size="sm" variant="outline" className="hidden md:flex gap-1.5 border-border" onClick={() => setWithdrawOpen(true)}>
            <Minus className="w-4 h-4" />
            WITHDRAW
          </Button>
        </div>

        {/* Game History Chips */}
        <div className="hidden lg:flex items-center gap-2 overflow-hidden max-w-[300px]">
          <div className="flex items-center text-xs font-bold text-muted-foreground uppercase tracking-wider mr-2 shrink-0">
            <Zap className="w-4 h-4 mr-1 text-warning" />
            Prev
          </div>
          {history?.slice(0, 6).map((round, idx) => {
            const m = round.crashedAt;
            const colorClass =
              m < 2.0 ? "text-destructive bg-destructive/10 border-destructive/20" :
              m < 5.0 ? "text-warning bg-warning/10 border-warning/20" :
              "text-success bg-success/10 border-success/20";
            return (
              <div
                key={round.id || idx}
                className={cn(
                  "px-2.5 py-1 rounded-full font-mono text-xs font-bold border transition-transform hover:-translate-y-0.5 cursor-pointer shadow-sm shrink-0",
                  colorClass
                )}
              >
                {m.toFixed(2)}x
              </div>
            );
          })}
        </div>

        {/* Logout */}
        <Button variant="ghost" size="sm" onClick={handleLogout} className="shrink-0 text-muted-foreground hover:text-foreground gap-2">
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </header>

      <DepositModal
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        userPhone={user?.phone}
      />
      <WithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        userPhone={user?.phone}
        balance={balance}
      />
    </>
  );
}
