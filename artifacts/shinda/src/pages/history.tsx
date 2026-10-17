import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useGetGameHistory, getGetGameHistoryQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  History as HistoryIcon,
  TrendingUp,
  TrendingDown,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";

function ResultLabel({ crashedAt }: { crashedAt: number }) {
  const isHigh = crashedAt >= 2;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold tracking-wide",
        isHigh
          ? "border-success/30 bg-success/10 text-success"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {isHigh ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {isHigh ? "HIGH" : "LOW"}
    </span>
  );
}

function RoundHash({ hash, roundId, copiedRoundId, onCopy }: {
  hash: string;
  roundId: number;
  copiedRoundId: number | null;
  onCopy: (hash: string, roundId: number) => void;
}) {
  const isCopied = copiedRoundId === roundId;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={hash}>
        {hash ? `${hash.slice(0, 20)}…` : "Unavailable"}
      </code>
      {hash && (
        <button
          type="button"
          onClick={() => onCopy(hash, roundId)}
          aria-label={isCopied ? `Hash for round ${roundId} copied` : `Copy full hash for round ${roundId}`}
          title={isCopied ? "Copied" : "Copy full hash"}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/70 text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isCopied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

export default function HistoryPage() {
  const { data: history, isLoading, isFetching } = useGetGameHistory(
    { limit: 100 },
    { query: { queryKey: getGetGameHistoryQueryKey({ limit: 100 }), refetchInterval: 10000 } },
  );
  const [copiedRoundId, setCopiedRoundId] = useState<number | null>(null);

  const copyHash = async (hash: string, roundId: number) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedRoundId(roundId);
      toast.success("Full round hash copied");
    } catch {
      toast.error("Could not copy hash. Check your browser clipboard permissions.");
    }
  };

  const totalRounds = history?.length ?? 0;
  const avgCrash = history?.length
    ? (history.reduce((sum, round) => sum + round.crashedAt, 0) / history.length).toFixed(2)
    : "—";
  const highestCrash = history?.length
    ? Math.max(...history.map((round) => round.crashedAt)).toFixed(2)
    : "—";
  const lowestCrash = history?.length
    ? Math.min(...history.map((round) => round.crashedAt)).toFixed(2)
    : "—";

  const stats = [
    { label: "Total Rounds", value: totalRounds.toLocaleString(), color: "text-foreground" },
    { label: "Average Crash", value: avgCrash === "—" ? avgCrash : `${avgCrash}x`, color: "text-warning" },
    { label: "Highest Crash", value: highestCrash === "—" ? highestCrash : `${highestCrash}x`, color: "text-success" },
    { label: "Lowest Crash", value: lowestCrash === "—" ? lowestCrash : `${lowestCrash}x`, color: "text-destructive" },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <div className="flex h-14 shrink-0 items-center border-b border-border/50 bg-card px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
              <HistoryIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold leading-tight">Game History</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">Review completed rounds and their recorded results</p>
            </div>
          </div>
        </div>

        <main className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 pb-24 sm:p-5 md:space-y-6 md:p-6 md:pb-6">
          <section aria-label="History statistics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="min-w-0 rounded-xl border border-border/70 bg-card p-3 shadow-sm sm:p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:text-xs">{stat.label}</p>
                <p className={cn("break-words font-display text-2xl font-bold sm:text-3xl", stat.color)}>{stat.value}</p>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-secondary/30 px-4 py-4 sm:px-5">
              <div>
                <h2 className="font-display text-sm font-bold sm:text-base">Recent Rounds</h2>
                <p className="mt-1 text-xs text-muted-foreground">Latest {totalRounds} recorded rounds · refreshes every 10 seconds</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground" aria-live="polite">
                <span className={cn("h-2 w-2 rounded-full bg-success", isFetching && "animate-pulse")} />
                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                Live updates
              </div>
            </div>

            {/* Classic table for larger screens */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 bg-secondary/50 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-4">Round</th>
                    <th scope="col" className="px-5 py-4">Crash Point</th>
                    <th scope="col" className="px-5 py-4">Result</th>
                    <th scope="col" className="px-5 py-4">Round Hash</th>
                    <th scope="col" className="px-5 py-4 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading && (
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Loading history…</td></tr>
                  )}
                  {!isLoading && history?.map((round) => (
                    <tr key={round.id} className="transition-colors hover:bg-secondary/20">
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-muted-foreground">#{round.id}</td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span className={cn(
                          "font-mono text-base font-bold",
                          round.crashedAt >= 5 ? "text-success" : round.crashedAt >= 2 ? "text-warning" : "text-destructive",
                        )}>{round.crashedAt.toFixed(2)}x</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4"><ResultLabel crashedAt={round.crashedAt} /></td>
                      <td className="max-w-[260px] px-5 py-3">
                        <RoundHash hash={round.hash} roundId={round.id} copiedRoundId={copiedRoundId} onCopy={copyHash} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right text-xs text-muted-foreground">
                        {new Date(round.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {!isLoading && !history?.length && (
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">No history recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Expanded stacked records on phones; no sideways scrolling required */}
            <div className="divide-y divide-border/60 md:hidden">
              {isLoading && <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading history…</p>}
              {!isLoading && history?.map((round) => (
                <article key={round.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Round</p>
                      <p className="mt-1 font-mono text-sm font-semibold">#{round.id}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Crash Point</p>
                      <p className={cn(
                        "mt-1 font-mono text-xl font-bold",
                        round.crashedAt >= 5 ? "text-success" : round.crashedAt >= 2 ? "text-warning" : "text-destructive",
                      )}>{round.crashedAt.toFixed(2)}x</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">Result</span>
                    <ResultLabel crashedAt={round.crashedAt} />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Round Hash</p>
                    <RoundHash hash={round.hash} roundId={round.id} copiedRoundId={copiedRoundId} onCopy={copyHash} />
                  </div>
                  <div className="flex items-start justify-between gap-3 border-t border-border/40 pt-2">
                    <span className="text-xs text-muted-foreground">Time</span>
                    <time className="text-right text-xs text-muted-foreground">{new Date(round.createdAt).toLocaleString()}</time>
                  </div>
                </article>
              ))}
              {!isLoading && !history?.length && (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">No history recorded yet.</p>
              )}
            </div>
          </section>
          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            Crash results are historical records, not predictions of future rounds.
          </p>
        </main>
      </div>
    </div>
  );
}
