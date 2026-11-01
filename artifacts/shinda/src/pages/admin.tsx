import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import {
  Users, GamepadIcon, ArrowLeftRight, BarChart3, RefreshCw, Shield,
  ShieldOff, UserCheck, UserX, ChevronLeft, ChevronRight, Wallet,
  Power, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/utils";
import { Sidebar } from "@/components/layout/sidebar";

type Tab = "stats" | "reserve" | "players" | "transactions" | "games";
interface Stats {
  players: number; games: number; totalDepositedKes: number;
  totalWithdrawnKes: number; totalBalanceKes: number; totalBets: number;
}
interface Reserve {
  balanceKes: number; reservedKes: number; availableKes: number;
  currency: string; riskRate: number; maxAllowedPayoutKes: number; updatedAt: string;
}
interface LedgerEntry {
  id: number; type: string; amountKes: number; balanceBeforeKes: number;
  balanceAfterKes: number; description?: string | null; createdAt: string;
}
interface GameControl { paused: boolean; reason: string | null; updatedAt: string | null }

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div className="bg-card border border-border/50 rounded-xl p-4 min-w-0">
    <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">{label}</p>
    <p className="text-xl md:text-2xl font-mono font-bold text-foreground break-words">{value}</p>
    {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
  </div>;
}

export default function AdminPage() {
  const { token, user } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [reserve, setReserve] = useState<Reserve | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [control, setControl] = useState<GameControl | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [transactions, setTxns] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [amount, setAmount] = useState("");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!user?.isAdmin) navigate("/"); }, [user, navigate]);

  const apiFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }, [token]);

  const loadStats = useCallback(async () => {
    setLoading(true); setError("");
    try { setStats(await apiFetch("/api/admin/stats")); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load overview"); }
    finally { setLoading(false); }
  }, [apiFetch]);

  const loadReserve = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [summary, entries] = await Promise.all([
        apiFetch("/api/admin/house-reserve"),
        apiFetch("/api/admin/house-reserve/ledger"),
      ]);
      setReserve(summary); setLedger(entries);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load reserve"); }
    finally { setLoading(false); }
  }, [apiFetch]);

  const loadControl = useCallback(async () => {
    try { setControl(await apiFetch("/api/admin/game-control")); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load game status"); }
  }, [apiFetch]);

  const loadPlayers = useCallback(async (p = 1) => {
    setLoading(true); setError("");
    try { setPlayers(await apiFetch(`/api/admin/players?page=${p}`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load players"); }
    finally { setLoading(false); }
  }, [apiFetch]);

  const loadTransactions = useCallback(async (p = 1) => {
    setLoading(true); setError("");
    try { setTxns(await apiFetch(`/api/admin/transactions?page=${p}`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load transactions"); }
    finally { setLoading(false); }
  }, [apiFetch]);

  const loadGames = useCallback(async (p = 1) => {
    setLoading(true); setError("");
    try { setGames(await apiFetch(`/api/admin/games?page=${p}`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load games"); }
    finally { setLoading(false); }
  }, [apiFetch]);

  useEffect(() => {
    setPage(1);
    if (tab === "stats") { void loadStats(); void loadControl(); void loadReserve(); }
    else if (tab === "reserve") { void loadReserve(); void loadControl(); }
    else if (tab === "players") void loadPlayers(1);
    else if (tab === "transactions") void loadTransactions(1);
    else if (tab === "games") void loadGames(1);
  }, [tab, loadStats, loadReserve, loadControl, loadPlayers, loadTransactions, loadGames]);

  async function adjustReserve(event: FormEvent) {
    event.preventDefault();
    const amountKes = Number(amount);
    if (!Number.isFinite(amountKes) || amountKes <= 0) { setError("Enter a valid amount greater than zero."); return; }
    if (!window.confirm(`Record KES ${amountKes.toLocaleString()} as a reserve ${action}? This changes the internal reserve ledger only; it does not move money through M-Pesa or a bank.`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await apiFetch("/api/admin/house-reserve/adjust", {
        method: "POST", body: JSON.stringify({ action, amountKes, description }),
      });
      setAmount(""); setDescription(""); setNotice("Reserve ledger updated successfully.");
      await loadReserve();
    } catch (e) { setError(e instanceof Error ? e.message : "Reserve adjustment failed"); }
    finally { setSaving(false); }
  }

  async function toggleKillSwitch() {
    if (!control) return;
    const paused = !control.paused;
    const message = paused
      ? "PAUSE the game? New bets will be blocked immediately. Any round already in progress will finish safely; no new rounds will start."
      : "RESUME the game? New rounds and bets will be allowed again.";
    if (!window.confirm(message)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const updated = await apiFetch("/api/admin/game-control", {
        method: "POST", body: JSON.stringify({ paused, reason: paused ? "Emergency pause activated by administrator" : "" }),
      });
      setControl({ paused: updated.paused, reason: updated.reason, updatedAt: new Date().toISOString() });
      setNotice(paused ? "Game paused. Current round will finish safely." : "Game resumed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not change game status"); }
    finally { setSaving(false); }
  }

  async function togglePlayer(id: number, field: "toggle-active" | "toggle-admin") {
    try {
      await apiFetch(`/api/admin/players/${id}/${field}`, { method: "PATCH" });
      await loadPlayers(page);
    } catch (e) { setError(e instanceof Error ? e.message : "Player update failed"); }
  }

  function handlePage(dir: 1 | -1) {
    const next = Math.max(1, page + dir); setPage(next);
    if (tab === "players") void loadPlayers(next);
    else if (tab === "transactions") void loadTransactions(next);
    else if (tab === "games") void loadGames(next);
  }

  const tabs = [
    { id: "stats" as Tab, label: "Overview", icon: BarChart3 },
    { id: "reserve" as Tab, label: "House Reserve", icon: Wallet },
    { id: "players" as Tab, label: "Players", icon: Users },
    { id: "transactions" as Tab, label: "Transactions", icon: ArrowLeftRight },
    { id: "games" as Tab, label: "Games", icon: GamepadIcon },
  ];

  if (!user?.isAdmin) return null;

  return <div className="flex min-h-screen md:h-screen w-full overflow-hidden bg-background text-foreground">
    <Sidebar />
    <div className="flex-1 flex flex-col min-w-0 md:h-full">
      <header className="min-h-16 border-b border-border/50 bg-card px-4 md:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3"><Shield className="w-5 h-5 text-primary" /><div><h1 className="text-lg font-bold font-display">Admin Panel</h1><p className="text-xs text-muted-foreground">Operator controls · {user.username}</p></div></div>
        <Button variant="outline" size="sm" onClick={() => { if (tab === "stats") { void loadStats(); void loadControl(); void loadReserve(); } else if (tab === "reserve") { void loadReserve(); void loadControl(); } else if (tab === "players") void loadPlayers(page); else if (tab === "transactions") void loadTransactions(page); else void loadGames(page); }} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></Button>
      </header>
      <div className="flex gap-1 px-3 md:px-6 pt-3 shrink-0 overflow-x-auto border-b border-border/40">
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 py-3 whitespace-nowrap text-sm font-medium border-b-2 ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><t.icon className="w-4 h-4" />{t.label}</button>)}
      </div>
      <main className="flex-1 overflow-y-auto p-3 md:p-6 pb-24 space-y-4">
        {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {notice && <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600">{notice}</div>}

        {(tab === "stats" || tab === "reserve") && <section className="rounded-xl border border-border/50 bg-card p-4 md:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold flex items-center gap-2"><Power className="w-4 h-4 text-destructive" />Emergency Kill Switch</h2><p className="text-xs text-muted-foreground mt-1">Stops new wagers and prevents subsequent rounds from starting.</p></div>
            {control && <Badge variant={control.paused ? "destructive" : "secondary"}>{control.paused ? "GAME PAUSED" : "GAME RUNNING"}</Badge>}
          </div>
          <Button className="w-full sm:w-auto" variant={control?.paused ? "default" : "destructive"} disabled={!control || saving} onClick={() => void toggleKillSwitch()}><Power className="w-4 h-4 mr-2" />{control?.paused ? "Resume Game" : "PAUSE GAME NOW"}</Button>
          {control?.paused && <p className="text-sm text-destructive font-medium">{control.reason || "Paused by administrator"}</p>}
          <p className="text-xs text-muted-foreground">A round already in progress is allowed to finish so active bets and cash-outs are not interrupted. The pause state is stored in the database and survives a server restart.</p>
        </section>}

        {tab === "stats" && <>
          {stats ? <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            <StatCard label="Total Players" value={stats.players.toLocaleString()} />
            <StatCard label="Total Games" value={stats.games.toLocaleString()} />
            <StatCard label="Total Bets" value={stats.totalBets.toLocaleString()} />
            <StatCard label="Total Deposited" value={`KES ${formatCurrency(stats.totalDepositedKes)}`} />
            <StatCard label="Total Withdrawn" value={`KES ${formatCurrency(stats.totalWithdrawnKes)}`} />
            <StatCard label="Player Wallet Balances" value={`KES ${formatCurrency(stats.totalBalanceKes)}`} sub="Combined player wallet balances; not house reserve cash" />
          </div> : <p className="text-sm text-muted-foreground">{loading ? "Loading overview…" : "Overview data unavailable."}</p>}
          {reserve && <div className="space-y-3"><h2 className="font-bold">House Reserve Snapshot</h2><div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            <StatCard label="Reserve Balance" value={`KES ${formatCurrency(reserve.balanceKes)}`} />
            <StatCard label="Reserved for Round Risk" value={`KES ${formatCurrency(reserve.reservedKes)}`} />
            <StatCard label="Available Reserve" value={`KES ${formatCurrency(reserve.availableKes)}`} />
            <StatCard label="Max Allowed Payout" value={`KES ${formatCurrency(reserve.maxAllowedPayoutKes)}`} sub="5% of reserve balance" />
          </div><Button variant="outline" onClick={() => setTab("reserve")}>Manage House Reserve</Button></div>}
        </>}

        {tab === "reserve" && <>
          {reserve && <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            <StatCard label="Reserve Balance" value={`KES ${formatCurrency(reserve.balanceKes)}`} />
            <StatCard label="Reserved" value={`KES ${formatCurrency(reserve.reservedKes)}`} sub="Held for current round risk" />
            <StatCard label="Available" value={`KES ${formatCurrency(reserve.availableKes)}`} />
            <StatCard label="Risk Rate" value={`${(reserve.riskRate * 100).toFixed(0)}%`} />
            <StatCard label="Max Allowed Payout" value={`KES ${formatCurrency(reserve.maxAllowedPayoutKes)}`} />
            <StatCard label="Currency" value={reserve.currency} />
          </div>}
          <form onSubmit={adjustReserve} className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
            <h2 className="font-bold">Reserve Ledger Adjustment</h2>
            <p className="text-xs text-muted-foreground">Record verified reserve funding or withdrawal. This updates the internal reserve ledger only; it does not initiate an M-Pesa or bank transfer.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm space-y-1">Action<select value={action} onChange={e => setAction(e.target.value as "deposit" | "withdraw")} className="w-full h-10 rounded-md border border-border bg-background px-3"><option value="deposit">Record funding</option><option value="withdraw">Record withdrawal</option></select></label>
              <label className="text-sm space-y-1">Amount (KES)<input type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} className="w-full h-10 rounded-md border border-border bg-background px-3" placeholder="e.g. 500" /></label>
            </div>
            <label className="text-sm block space-y-1">Description (optional)<input value={description} onChange={e => setDescription(e.target.value)} maxLength={250} className="w-full h-10 rounded-md border border-border bg-background px-3" placeholder="Reference or reason for this ledger entry" /></label>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : action === "deposit" ? "Record Reserve Funding" : "Record Reserve Withdrawal"}</Button>
          </form>
          <section className="rounded-xl border border-border/50 bg-card p-4 space-y-3"><h2 className="font-bold flex items-center gap-2"><History className="w-4 h-4" />Recent Reserve Ledger</h2>
            {ledger.length === 0 ? <p className="text-sm text-muted-foreground">No ledger entries found.</p> : ledger.map(entry => <div key={entry.id} className="border-b border-border/40 last:border-0 py-2 flex flex-wrap justify-between gap-2 text-sm"><div><p className="font-semibold">{entry.type.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{entry.description || "—"} · {new Date(entry.createdAt).toLocaleString()}</p></div><div className="text-right font-mono"><p>KES {formatCurrency(entry.amountKes)}</p><p className="text-xs text-muted-foreground">Balance: {formatCurrency(entry.balanceAfterKes)}</p></div></div>)}
          </section>
        </>}

        {tab === "players" && <div className="space-y-3">{players.map(p => <div key={p.id} className="bg-card border border-border/50 rounded-xl p-4 flex items-center justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><span className="font-bold text-sm">{p.username}</span>{p.isAdmin && <Badge>Admin</Badge>}{!p.isActive && <Badge variant="destructive">Suspended</Badge>}</div><div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap"><span>{p.phone}</span><span>Balance: KES {formatCurrency(p.balanceKes)}</span></div></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void togglePlayer(p.id,"toggle-active")} title={p.isActive ? "Suspend player" : "Restore player"}>{p.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}</Button><Button size="sm" variant="outline" onClick={() => void togglePlayer(p.id,"toggle-admin")} title={p.isAdmin ? "Remove admin" : "Grant admin"}>{p.isAdmin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}</Button></div></div>)}</div>}

        {tab === "transactions" && <div className="space-y-2">{transactions.map(t => <div key={t.id} className="bg-card border border-border/50 rounded-xl p-4"><div className="flex gap-2 flex-wrap items-center"><b className="text-sm">{t.username ?? `User #${t.userId}`}</b><Badge variant="secondary">{t.type}</Badge><Badge variant={t.status === "completed" ? "default" : "destructive"}>{t.status}</Badge></div><p className="text-xs text-muted-foreground mt-2">KES {formatCurrency(t.amountKes)} · {new Date(t.createdAt).toLocaleString()}</p></div>)}</div>}

        {tab === "games" && <div className="space-y-2">{games.map(g => <div key={g.id} className="bg-card border border-border/50 rounded-xl p-4"><div className="flex items-center gap-2"><b>Round #{g.id}</b><Badge variant="secondary">{g.state}</Badge>{g.crashPointMultiplier && <b>{g.crashPointMultiplier.toFixed(2)}x</b>}</div><p className="text-xs text-muted-foreground mt-2">{g.playerCount} players · Bets KES {formatCurrency(g.totalBetsKes)} · Payout KES {formatCurrency(g.totalPayoutKes)}</p></div>)}</div>}

        {tab !== "stats" && tab !== "reserve" && <div className="flex items-center justify-center gap-4 pt-4"><Button variant="outline" size="sm" onClick={() => handlePage(-1)} disabled={page === 1 || loading}><ChevronLeft className="w-4 h-4" /></Button><span className="text-sm text-muted-foreground">Page {page}</span><Button variant="outline" size="sm" onClick={() => handlePage(1)} disabled={loading}><ChevronRight className="w-4 h-4" /></Button></div>}
      </main>
    </div>
  </div>;
}
