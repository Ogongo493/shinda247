import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Users, GamepadIcon, ArrowLeftRight, BarChart3, RefreshCw, Shield, ShieldOff, UserCheck, UserX, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/utils";
import { Sidebar } from "@/components/layout/sidebar";

type Tab = "stats" | "players" | "transactions" | "games";

interface Stats {
  players: number;
  games: number;
  totalDepositedKes: number;
  totalWithdrawnKes: number;
  totalBalanceKes: number;
  totalBets: number;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border border-border/50 rounded-xl p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">{label}</p>
      <p className="text-2xl font-mono font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const { token, user } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [transactions, setTxns] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  if (!user?.isAdmin) {
    navigate("/");
    return null;
  }

  async function apiFetch(path: string) {
    const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Request failed");
    return res.json();
  }

  async function loadStats() {
    setLoading(true);
    try { setStats(await apiFetch("/api/admin/stats")); } catch {} finally { setLoading(false); }
  }

  async function loadPlayers(p = 1) {
    setLoading(true);
    try { setPlayers(await apiFetch(`/api/admin/players?page=${p}`)); } catch {} finally { setLoading(false); }
  }

  async function loadTransactions(p = 1) {
    setLoading(true);
    try { setTxns(await apiFetch(`/api/admin/transactions?page=${p}`)); } catch {} finally { setLoading(false); }
  }

  async function loadGames(p = 1) {
    setLoading(true);
    try { setGames(await apiFetch(`/api/admin/games?page=${p}`)); } catch {} finally { setLoading(false); }
  }

  useEffect(() => {
    setPage(1);
    if (tab === "stats") loadStats();
    else if (tab === "players") loadPlayers(1);
    else if (tab === "transactions") loadTransactions(1);
    else if (tab === "games") loadGames(1);
  }, [tab]);

  async function toggleActive(id: number) {
    await fetch(`/api/admin/players/${id}/toggle-active`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    loadPlayers(page);
  }

  async function toggleAdmin(id: number) {
    await fetch(`/api/admin/players/${id}/toggle-admin`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    loadPlayers(page);
  }

  function handlePage(dir: 1 | -1) {
    const next = Math.max(1, page + dir);
    setPage(next);
    if (tab === "players") loadPlayers(next);
    else if (tab === "transactions") loadTransactions(next);
    else if (tab === "games") loadGames(next);
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "stats", label: "Overview", icon: BarChart3 },
    { id: "players", label: "Players", icon: Users },
    { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
    { id: "games", label: "Games", icon: GamepadIcon },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <header className="h-16 border-b border-border/50 bg-card px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold font-display">Admin Panel</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={() => (tab === "stats" ? loadStats() : tab === "players" ? loadPlayers(page) : tab === "transactions" ? loadTransactions(page) : loadGames(page))} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </header>

        <div className="flex gap-1 px-6 pt-4 shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        <main className="flex-1 overflow-y-auto p-6 space-y-4">
          {tab === "stats" && stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard label="Total Players" value={stats.players.toLocaleString()} />
              <StatCard label="Total Games" value={stats.games.toLocaleString()} />
              <StatCard label="Total Bets" value={stats.totalBets.toLocaleString()} />
              <StatCard label="Total Deposited" value={`KES ${formatCurrency(stats.totalDepositedKes)}`} />
              <StatCard label="Total Withdrawn" value={`KES ${formatCurrency(stats.totalWithdrawnKes)}`} />
              <StatCard label="Total Balance (House)" value={`KES ${formatCurrency(stats.totalBalanceKes)}`} sub="Sum of all player wallets" />
            </div>
          )}

          {tab === "players" && (
            <div className="space-y-3">
              {players.map(p => (
                <div key={p.id} className="bg-card border border-border/50 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{p.username}</span>
                      {p.isAdmin && <Badge variant="secondary" className="text-xs">Admin</Badge>}
                      {!p.isActive && <Badge variant="destructive" className="text-xs">Banned</Badge>}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground font-mono flex-wrap">
                      <span>{p.phone}</span>
                      <span>Balance: KES {formatCurrency(p.balanceKes)}</span>
                      <span>Deposited: KES {formatCurrency(p.totalDepositedKes)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => toggleActive(p.id)} title={p.isActive ? "Ban player" : "Unban player"}>
                      {p.isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggleAdmin(p.id)} title={p.isAdmin ? "Remove admin" : "Make admin"}>
                      {p.isAdmin ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "transactions" && (
            <div className="space-y-2">
              {transactions.map(t => (
                <div key={t.id} className="bg-card border border-border/50 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{t.username ?? `User #${t.userId}`}</span>
                      <Badge variant={t.type === "deposit" ? "default" : t.type === "withdrawal" ? "destructive" : "secondary"} className="text-xs capitalize">
                        {t.type}
                      </Badge>
                      <Badge variant={t.status === "completed" ? "default" : t.status === "failed" ? "destructive" : "secondary"} className="text-xs capitalize">
                        {t.status}
                      </Badge>
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground font-mono flex-wrap">
                      <span>KES {formatCurrency(t.amountKes)}</span>
                      {t.mpesaRef && <span>Ref: {t.mpesaRef}</span>}
                      <span>{new Date(t.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "games" && (
            <div className="space-y-2">
              {games.map(g => (
                <div key={g.id} className="bg-card border border-border/50 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold font-mono text-sm">#{g.id}</span>
                      {g.crashPointMultiplier && (
                        <span className={`font-bold font-mono text-sm ${g.crashPointMultiplier < 2 ? "text-destructive" : g.crashPointMultiplier < 5 ? "text-warning" : "text-success"}`}>
                          {g.crashPointMultiplier.toFixed(2)}x
                        </span>
                      )}
                      <Badge variant="secondary" className="text-xs capitalize">{g.state}</Badge>
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground font-mono flex-wrap">
                      <span>{g.playerCount} players</span>
                      <span>Bets: KES {formatCurrency(g.totalBetsKes)}</span>
                      <span>Payout: KES {formatCurrency(g.totalPayoutKes)}</span>
                      <span>{new Date(g.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab !== "stats" && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button variant="outline" size="sm" onClick={() => handlePage(-1)} disabled={page === 1 || loading}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <Button variant="outline" size="sm" onClick={() => handlePage(1)} disabled={loading}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
