import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useGetGameHistory } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { History as HistoryIcon, TrendingUp, TrendingDown } from "lucide-react";

export default function HistoryPage() {
  const { data: history, isLoading } = useGetGameHistory({ limit: 100 }, { query: { refetchInterval: 10000 } });

  const totalRounds = history?.length ?? 0;
  const avgCrash = history?.length
    ? (history.reduce((sum, r) => sum + r.crashedAt, 0) / history.length).toFixed(2)
    : "—";
  const highestCrash = history?.length
    ? Math.max(...history.map(r => r.crashedAt)).toFixed(2)
    : "—";
  const lowestCrash = history?.length
    ? Math.min(...history.map(r => r.crashedAt)).toFixed(2)
    : "—";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Topbar />
        <div className="h-14 flex items-center px-6 border-b border-border/50 bg-card shrink-0">
          <div className="flex items-center gap-3">
            <HistoryIcon className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-display font-bold">Game History</h1>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Rounds", value: totalRounds, color: "text-foreground" },
              { label: "Avg Crash", value: `${avgCrash}x`, color: "text-warning" },
              { label: "Highest", value: `${highestCrash}x`, color: "text-success" },
              { label: "Lowest", value: `${lowestCrash}x`, color: "text-destructive" },
            ].map(stat => (
              <div key={stat.label} className="bg-card border border-border/50 rounded-2xl p-4 text-center shadow-xl">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-2">{stat.label}</p>
                <p className={cn("text-3xl font-display font-bold", stat.color)}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* History Table */}
          <div className="bg-card border border-border/50 rounded-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border/50 bg-secondary/30">
              <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Recent Rounds</h2>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 sticky top-0 font-bold tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Round</th>
                    <th className="px-6 py-4">Crash Point</th>
                    <th className="px-6 py-4">Result</th>
                    <th className="px-6 py-4">Hash</th>
                    <th className="px-6 py-4 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-muted-foreground">Loading history...</td>
                    </tr>
                  )}
                  {history?.map((round) => (
                    <tr key={round.id} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                      <td className="px-6 py-3 font-mono text-muted-foreground">#{round.id}</td>
                      <td className="px-6 py-3 font-mono font-bold text-lg">
                        <span className={cn(
                          round.crashedAt >= 5 ? "text-success" :
                          round.crashedAt >= 2 ? "text-warning" : "text-destructive"
                        )}>
                          {round.crashedAt.toFixed(2)}x
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        {round.crashedAt >= 2 ? (
                          <span className="flex items-center gap-1 text-success text-xs font-bold">
                            <TrendingUp className="w-3 h-3" /> HIGH
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-destructive text-xs font-bold">
                            <TrendingDown className="w-3 h-3" /> LOW
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 font-mono text-muted-foreground text-xs">{round.hash.substring(0, 20)}...</td>
                      <td className="px-6 py-3 text-right text-muted-foreground text-xs">
                        {new Date(round.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {!isLoading && !history?.length && (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-muted-foreground">No history yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
