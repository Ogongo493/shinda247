import { useState, useEffect } from "react";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Zap, LogOut, User, Settings, KeyRound, X, HelpCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, cn } from "@/lib/utils";
import { useGetGameHistory, getGetGameHistoryQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { DepositModal, WithdrawModal } from "@/components/wallet/wallet-modals";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { BrandLogo } from "@/components/brand-logo";

// ── Confirm sign-out dialog ──────────────────────────────────────────────────
function ConfirmLogoutDialog({ open, onConfirm, onCancel }: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <LogOut className="w-5 h-5 text-destructive" />
            Sign Out
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mt-1">
          Are you sure you want to sign out of your account?
        </p>
        <div className="flex gap-3 mt-4">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm}>
            Sign Out
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Change password dialog ───────────────────────────────────────────────────
function ChangePasswordDialog({ open, onClose, token }: {
  open: boolean;
  onClose: () => void;
  token: string | null;
}) {
  const { toast } = useToast();
  const [current,  setCurrent]  = useState("");
  const [next,     setNext]     = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (next.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "Failed to change password", variant: "destructive" });
        return;
      }
      toast({ title: "Password changed", description: "Your password has been updated successfully." });
      setCurrent(""); setNext(""); setConfirm("");
      onClose();
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-1 sm:gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            Change Password
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Current Password</label>
            <Input type="password" value={current} onChange={e => setCurrent(e.target.value)} className="h-11" required />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">New Password</label>
            <Input type="password" value={next} onChange={e => setNext(e.target.value)} className="h-11" minLength={6} required />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Confirm New Password</label>
            <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="h-11" minLength={6} required />
          </div>
          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Profile drawer ────────────────────────────────────────────────────────────
function ProfileDrawer({ open, onClose, user, balance, token, onLogout, onDeposit, onWithdraw }: {
  open: boolean;
  onClose: () => void;
  user: any;
  balance: number;
  token: string | null;
  onLogout: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
}) {
  const [, navigate] = useLocation();
  const [changePwOpen, setChangePwOpen] = useState(false);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-[90]" onClick={onClose} />

      {/* Drawer */}
      <div role="dialog" aria-modal="true" aria-label="My account" className="fixed inset-y-0 right-0 w-full max-w-sm bg-card border-l border-border/50 z-[100] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <h2 className="font-display font-bold text-lg">My Account</h2>
          <button type="button" aria-label="Close account panel" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Profile card */}
          <div className="p-5 border-b border-border/50">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/50 flex items-center justify-center text-primary font-display font-bold text-2xl shrink-0">
                {user?.username?.charAt(0).toUpperCase() ?? "?"}
              </div>
              <div>
                <p className="font-display font-bold text-lg break-words">{user?.username ?? "Account"}</p>
                <p className="text-xs text-muted-foreground">ID: #{user?.id}</p>
                <p className="text-xs text-muted-foreground">Phone: {user?.phone ?? "Not provided"}</p>
              </div>
            </div>
          </div>

          {/* Balance card */}
          <div className="p-5 border-b border-border/50">
            <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-2">Wallet Balance</p>
            <p className="text-3xl font-mono font-bold text-foreground">KES {formatCurrency(balance)}</p>
            <div className="flex gap-3 mt-4">
              <Button className="flex-1 gap-2" onClick={() => { onDeposit(); onClose(); }}>
                <ArrowDownToLine className="w-4 h-4" /> Deposit
              </Button>
              <Button variant="outline" className="flex-1 gap-2 border-border" onClick={() => { onWithdraw(); onClose(); }}>
                <ArrowUpFromLine className="w-4 h-4" /> Withdraw
              </Button>
            </div>
          </div>

          {/* Settings menu */}
          <div className="p-3">
            <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider px-2 mb-2">Settings</p>

            <button
              onClick={() => setChangePwOpen(true)}
              className="flex w-full items-center justify-between px-3 py-3.5 rounded-xl hover:bg-secondary transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <KeyRound className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-medium">Change Password</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <button
              onClick={() => { navigate("/faq"); onClose(); }}
              className="flex w-full items-center justify-between px-3 py-3.5 rounded-xl hover:bg-secondary transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <HelpCircle className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-medium">FAQ & Help</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <button
              onClick={onLogout}
              className="flex w-full items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-destructive/10 transition-colors text-destructive mt-1"
            >
              <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <LogOut className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      <ChangePasswordDialog open={changePwOpen} onClose={() => setChangePwOpen(false)} token={token} />
    </>
  );
}

// ── Main Topbar ───────────────────────────────────────────────────────────────
export function Topbar() {
  const { user, token, logout } = useAuth();
  const [, navigate] = useLocation();
  const [balance,        setBalance]        = useState<number>(0);
  const [depositOpen,    setDepositOpen]    = useState(false);
  const [withdrawOpen,   setWithdrawOpen]   = useState(false);
  const [profileOpen,    setProfileOpen]    = useState(false);
  const [confirmLogout,  setConfirmLogout]  = useState(false);

  useEffect(() => {
    if (!user || !token) return;
    const fetchWallet = async () => {
      try {
        const res = await fetch("/api/wallet", { headers: { Authorization: `Bearer ${token}` } });
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
      {/* ── Header bar ───────────────────────────────────────────────── */}
      <header className="min-h-14 md:h-16 w-full min-w-0 bg-card border-b border-border/50 flex items-center justify-between gap-1 sm:gap-2 px-2 sm:px-3 md:px-6 z-20 shrink-0">

        {/* Mobile logo */}
        <BrandLogo size="sm" className="md:hidden shrink-0" />

        {/* Desktop user info */}
        <button
          type="button"
          aria-label={`Open account for ${user?.username ?? "your account"}`}
          onClick={() => setProfileOpen(true)}
          className="hidden md:flex items-center gap-3 hover:bg-secondary rounded-xl p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="w-10 h-10 rounded-full border-2 border-primary/50 flex items-center justify-center bg-primary/10 text-primary font-bold font-display">
            {avatarLetter}
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-foreground font-display">{user?.username ?? "—"}</p>
            <p className="text-xs text-muted-foreground">ID: {user?.id ?? "—"}</p>
          </div>
        </button>

        {/* Right actions */}
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">

          {/* Balance chip */}
          <div role="group" aria-label={`Wallet balance: KES ${formatCurrency(balance)}`} className="flex min-w-0 shrink items-center bg-background rounded-lg sm:rounded-xl px-1.5 sm:px-2.5 py-1.5 border border-border/50 gap-1 sm:gap-2">
            <Wallet className="w-3.5 h-3.5 text-primary shrink-0" />
            <div className="flex flex-col leading-none">
              <span className="hidden sm:block text-[9px] uppercase text-muted-foreground font-bold tracking-wider">Balance</span>
              <span className="whitespace-nowrap font-mono font-bold text-[10px] sm:text-xs md:text-sm text-foreground">KES {formatCurrency(balance)}</span>
            </div>
          </div>

          {/* Deposit + Withdraw — visible on ALL screen sizes */}
          <Button size="sm" aria-label="Deposit funds" className="h-8 px-2 sm:px-3 text-xs gap-1 shrink-0" onClick={() => setDepositOpen(true)}>
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Deposit</span>
          </Button>
          <Button size="sm" variant="outline" aria-label="Withdraw funds" className="h-8 px-2 sm:px-3 text-xs gap-1 border-border shrink-0" onClick={() => setWithdrawOpen(true)}>
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Withdraw</span>
          </Button>

          {/* Profile avatar — mobile (opens drawer) */}
          <button
            type="button"
            aria-label={`Open account for ${user?.username ?? "your account"}`}
            onClick={() => setProfileOpen(true)}
            className="w-8 h-8 min-w-8 min-h-8 shrink-0 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary font-bold font-display text-sm md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {avatarLetter}
          </button>

          {/* Desktop logout */}
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            aria-label="Sign out"
            className="hidden md:flex w-9 h-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

      {/* ── Modals & Drawers ──────────────────────────────────────────── */}
      <DepositModal  open={depositOpen}  onClose={() => setDepositOpen(false)} userPhone={user?.phone} />
      <WithdrawModal open={withdrawOpen} onClose={() => setWithdrawOpen(false)} balance={balance} userPhone={user?.phone} />

      <ProfileDrawer
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={user}
        balance={balance}
        token={token}
        onLogout={() => { setProfileOpen(false); setConfirmLogout(true); }}
        onDeposit={() => setDepositOpen(true)}
        onWithdraw={() => setWithdrawOpen(true)}
      />

      <ConfirmLogoutDialog
        open={confirmLogout}
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </>
  );
}
