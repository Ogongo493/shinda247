import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useGetLeaderboard, useGetActivePlayers } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Users, Trophy, Medal } from "lucide-react";

export default function PlayersPage() {
  const { data: leaderboard, isLoading: loadingLeaderboard } = useGetLeaderboard({ query: { refetchInterval: 5000 } });
  const { data: activePlayers, isLoading: loadingActive } = useGetActivePlayers({ query: { refetchInterval: 2000 } });

  const rankColor = (rank: number) => {
    if (rank === 1) return "text-yellow-400";
    if (rank === 2) return "text-gray-400";
    if (rank === 3) return "text-amber-600";
    return "text-muted-foreground";
  };

  const avatarColor = (name: string) => {
    const colors = ["bg-orange-500", "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-pink-500", "bg-teal-500", "bg-red-500", "bg-indigo-500"];
    return colors[name.charCodeAt(0) % colors.length];
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Topbar />
        <div className="h-14 flex items-center px-6 border-b border-border/50 bg-card shrink-0">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-display font-bold">Players</h1>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Leaderboard */}
            <div className="bg-card border border-border/50 rounded-2xl shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border/50 bg-secondary/30 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                <h2 className="font-bold text-sm uppercase tracking-wider">All-Time Leaderboard</h2>
              </div>
              <div className="overflow-auto">
                {loadingLeaderboard ? (
                  <p className="text-center py-10 text-muted-foreground">Loading...</p>
                ) : leaderboard?.length ? (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 font-bold tracking-wider">
                      <tr>
                        <th className="px-6 py-3 text-left">#</th>
                        <th className="px-6 py-3 text-left">Player</th>
                        <th className="px-6 py-3 text-right">Cash Out</th>
                        <th className="px-6 py-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((player, i) => (
                        <tr key={player.username} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                          <td className="px-6 py-3">
                            <span className={cn("font-bold font-mono", rankColor(i + 1))}>
                              {i < 3 ? <Medal className="w-4 h-4 inline" /> : `#${i + 1}`}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white", avatarColor(player.username))}>
                                {player.username[0].toUpperCase()}
                              </div>
                              <span className="font-medium">{player.username}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right font-mono font-bold text-success">{player.multiplier.toFixed(2)}x</td>
                          <td className="px-6 py-3 text-right font-mono">KES {player.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-center py-10 text-muted-foreground">No leaderboard data yet</p>
                )}
              </div>
            </div>

            {/* Active Players This Round */}
            <div className="bg-card border border-border/50 rounded-2xl shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border/50 bg-secondary/30 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <h2 className="font-bold text-sm uppercase tracking-wider">Active This Round</h2>
                <span className="ml-auto text-xs text-muted-foreground">{activePlayers?.length ?? 0} players</span>
              </div>
              <div className="overflow-auto">
                {loadingActive ? (
                  <p className="text-center py-10 text-muted-foreground">Loading...</p>
                ) : activePlayers?.length ? (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 font-bold tracking-wider">
                      <tr>
                        <th className="px-6 py-3 text-left">Player</th>
                        <th className="px-6 py-3 text-right">Bet</th>
                        <th className="px-6 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePlayers.map((player) => (
                        <tr key={player.id} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white", avatarColor(player.username))}>
                                {player.username[0].toUpperCase()}
                              </div>
                              <span className="font-medium">{player.username}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right font-mono">KES {player.amount.toLocaleString()}</td>
                          <td className="px-6 py-3 text-right">
                            {player.cashedOut ? (
                              <span className="text-success text-xs font-bold">{player.multiplier?.toFixed(2)}x</span>
                            ) : (
                              <span className="text-warning text-xs font-bold animate-pulse">LIVE</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-center py-10 text-muted-foreground">No active players this round</p>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
