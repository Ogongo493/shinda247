import { useState, useEffect } from "react";
import { Wallet, Plus, Minus, Zap, LogOut, Menu, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, cn } from "@/lib/utils";
import { useGetGameHistory, getGetGameHistoryQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { DepositModal, WithdrawModal } from "@/components/wallet/wallet-modals";

export function Topbar() {
  const { user, token, logout } = useAuth();
  const [, navigate] = useLocation();
  const [balance,        setBalance]        = useState<number>(0);
  const [depositOpen,    setDepositOpen]    = useState(false);
  const [withdrawOpen,   setWithdrawOpen]   = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!user || !token) return;
    const fetchWallet = async () => {
      try {
        const res = await fetch("/api/wallet", {
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

  const { data: history } = useGetGameHistory(
    { limit: 8 },
    { query: { queryKey: getGetGameHistoryQueryKey({ limit: 8 }), refetchInterval: 5000 } }
  );

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const avatarLetter = user?.username?.charAt(0).toUpperCase() ?? "?";

  return (
    <>
      {/* ── Main header bar ──────────────────────────────────────────── */}
      <header className="h-14 md:h-16 w-full bg-card border-b border-border/50 flex items-center justify-between px-3 md:px-6 z-20 shrink-0">

        {/* Mobile: logo */}
        <div className="flex items-center gap-2 text-primary font-display font-bold text-lg tracking-tighter md:hidden">
          <Flame className="w-6 h-6 fill-primary" />
          <span>SHINDA<span className="text-foreground">24/7</span></span>
        </div>

        {/* Desktop: user profile */}
        <div className="hidden md:flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-primary/50 flex items-center justify-center bg-primary/10 text-primary font-bold font-display">
            {avatarLetter}
          </div>
          <div>
            <p className="text-sm font-bold text-foreground font-display uppercase">{user?.username ?? "—"}</p>
            <p className="text-xs text-muted-foreground">ID: {user?.id ?? "—"}</p>
          </div>
        </div>

        {/* Right: balance + actions */}
        <div className="flex items-center gap-2">

          {/* Balance chip */}
          <div className="flex items-center bg-background rounded-xl px-2.5 py-1.5 border border-border/50 gap-2">
            <Wallet className="w-3.5 h-3.5 text-primary shrink-0" />
            <div className="flex flex-col leading-none">
              <span className="text-[9px] uppercase text-muted-foreground font-bold tracking-wider">Balance</span>
              <span className="font-mono font-bold text-xs md:text-sm text-foreground">KES {formatCurrency(balance)}</span>
            </div>
          </div>

          {/* Desktop buttons */}
          <Button size="sm" className="hidden md:flex gap-1.5" onClick={() => setDepositOpen(true)}>
            <Plus className="w-4 h-4" /> DEPOSIT
          </Button>
          <Button size="sm" variant="outline" className="hidden md:flex gap-1.5 border-border" onClick={() => setWithdrawOpen(true)}>
            <Minus className="w-4 h-4" /> WITHDRAW
          </Button>

          {/* Mobile: deposit button */}
          <Button size="sm" className="md:hidden h-8 px-3 text-xs gap-1" onClick={() => setDepositOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>

          {/* Mobile: overflow menu */}
          <div className="relative md:hidden">
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-secondary text-muted-foreground"
            >
              <Menu className="w-4 h-4" />
            </button>
            {mobileMenuOpen && (
              <div className="absolute right-0 top-10 w-44 bg-card border border-border/50 rounded-xl shadow-xl z-50 overflow-hidden">
                <button
                  onClick={() => { setWithdrawOpen(true); setMobileMenuOpen(false); }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-secondary transition-colors"
                >
                  <Minus className="w-4 h-4" /> Withdraw
                </button>
                <button
                  onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            )}
          </div>

          {/* Desktop logout */}
          <button
            onClick={handleLogout}
            title="Sign out"
            className="hidden md:flex w-9 h-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Crash history ticker ─────────────────────────────────────── */}
      {history && history.length > 0 && (
        <div className="h-8 bg-secondary/50 border-b border-border/30 flex items-center px-3 gap-2 overflow-hidden shrink-0">
          <Zap className="w-3 h-3 text-primary shrink-0" />
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {history.slice(0, 12).map((r) => (
              <span
                key={r.id}
                className={cn(
                  "text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0",
                  r.crashedAt >= 5  ? "bg-success/10 text-success" :
                  r.crashedAt >= 2  ? "bg-warning/10 text-warning" :
                                      "bg-destructive/10 text-destructive"
                )}
              >
                {r.crashedAt.toFixed(2)}x
              </span>
            ))}
          </div>
        </div>
      )}

      <DepositModal  open={depositOpen}  onClose={() => setDepositOpen(false)} />
      <WithdrawModal open={withdrawOpen} onClose={() => setWithdrawOpen(false)} balance={balance} userPhone={user?.phone} />
    </>
  );
}
