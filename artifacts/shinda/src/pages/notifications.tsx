import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useGetGameHistory, getGetGameHistoryQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import {
  Bell, Zap, Trophy, TrendingUp, Info,
  ArrowDownCircle, ArrowUpCircle, DollarSign, CheckCircle2, XCircle, Clock
} from "lucide-react";
import { useEffect, useState } from "react";

interface UserNotification {
  id: number;
  type: string;
  status: string;
  amountCents: number;
  description: string | null;
  mpesaRef: string | null;
  createdAt: string;
}

function TransactionNotifications({ token }: { token: string }) {
  const [txns, setTxns] = useState<UserNotification[]>([]);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await fetch("/api/notifications", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setTxns(await res.json());
      } catch {}
    };
    fetchNotifications();
    const iv = setInterval(fetchNotifications, 10000);
    return () => clearInterval(iv);
  }, [token]);

  if (!txns.length) return null;

  const txIcon = (type: string) => {
    if (type === "deposit") return ArrowDownCircle;
    if (type === "withdrawal") return ArrowUpCircle;
    if (type === "win") return DollarSign;
    return Info;
  };

  const txColor = (type: string, status: string) => {
    if (status === "failed") return "text-destructive";
    if (type === "deposit") return "text-success";
    if (type === "win") return "text-yellow-400";
    if (type === "withdrawal") return "text-warning";
    return "text-muted-foreground";
  };

  const txBg = (type: string, status: string) => {
    if (status === "failed") return "bg-destructive/10";
    if (type === "deposit") return "bg-success/10";
    if (type === "win") return "bg-yellow-500/10";
    if (type === "withdrawal") return "bg-warning/10";
    return "bg-secondary/30";
  };

  const statusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle2 className="w-3 h-3 text-success inline ml-1" />;
    if (status === "failed") return <XCircle className="w-3 h-3 text-destructive inline ml-1" />;
    return <Clock className="w-3 h-3 text-warning inline ml-1" />;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-3 mb-6">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Your Transactions</h3>
      {txns.map(tx => {
        const Icon = txIcon(tx.type);
        const color = txColor(tx.type, tx.status);
        const bg = txBg(tx.type, tx.status);
        const amount = (tx.amountCents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 });
        return (
          <div key={tx.id} className={cn("flex items-start gap-4 p-4 rounded-2xl border border-border/30", bg)}>
            <div className={cn("mt-0.5 shrink-0", color)}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("font-bold text-sm capitalize", color)}>
                {tx.type} — KES {amount}
                {statusIcon(tx.status)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {tx.description ?? (tx.mpesaRef ? `Ref: ${tx.mpesaRef}` : "No description")}
              </p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {new Date(tx.createdAt).toLocaleTimeString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function NotificationsPage() {
  const { token } = useAuth();
  const { data: history } = useGetGameHistory({ limit: 20 }, { query: { queryKey: getGetGameHistoryQueryKey({ limit: 20 }), refetchInterval: 10000 } });

  const gameNotifications = history?.map((round, i) => {
    const crash = round.crashedAt;
    let icon = Info;
    let color = "text-muted-foreground";
    let bg = "bg-secondary/30";
    let title = `Round #${round.id} ended at ${crash.toFixed(2)}x`;
    let message = "The rocket has landed.";

    if (crash >= 10) {
      icon = Trophy;
      color = "text-yellow-400";
      bg = "bg-yellow-500/10";
      title = `Mega crash at ${crash.toFixed(2)}x!`;
      message = "High multiplier round — big wins for those who cashed out!";
    } else if (crash >= 5) {
      icon = TrendingUp;
      color = "text-success";
      bg = "bg-success/10";
      title = `Big round! Crashed at ${crash.toFixed(2)}x`;
      message = "Decent multiplier — good cashout opportunity.";
    } else if (crash >= 2) {
      icon = Zap;
      color = "text-warning";
      bg = "bg-warning/10";
      title = `Round #${round.id} crashed at ${crash.toFixed(2)}x`;
      message = "Moderate round. Stay alert!";
    } else {
      color = "text-destructive";
      bg = "bg-destructive/10";
      title = `Early crash at ${crash.toFixed(2)}x`;
      message = `Round #${round.id} crashed early. Better luck next time.`;
    }

    return { id: round.id, icon, color, bg, title, message, time: round.createdAt };
  }) ?? [];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Topbar />
        <div className="h-14 flex items-center px-6 border-b border-border/50 bg-card shrink-0">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-display font-bold">Notifications</h1>
            {gameNotifications.length > 0 && (
              <span className="ml-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                {gameNotifications.length}
              </span>
            )}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-6">
          {token && <TransactionNotifications token={token} />}

          {gameNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
                <Bell className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-display font-bold">No notifications yet</h3>
              <p className="text-muted-foreground">Game round results will appear here as they happen.</p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-3">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Game History</h3>
              {gameNotifications.map((n) => (
                <div
                  key={n.id}
                  className={cn("flex items-start gap-4 p-4 rounded-2xl border border-border/30", n.bg)}
                >
                  <div className={cn("mt-0.5 shrink-0", n.color)}>
                    <n.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-bold text-sm", n.color)}>{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(n.time).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
