import { useState } from "react";
import { formatCurrency, cn } from "@/lib/utils";
import { useGetGameHistory } from "@workspace/api-client-react";
import { History, MessageSquare, UserPlus } from "lucide-react";

export function HistoryPanel() {
  const [activeTab, setActiveTab] = useState("history");
  const { data: history } = useGetGameHistory({ limit: 15 }, { query: { refetchInterval: 10000 } });

  const tabs = [
    { id: "history", label: "History", icon: History },
    { id: "support", label: "Customer Care", icon: MessageSquare },
    { id: "refer", label: "Refer & Earn", icon: UserPlus },
  ];

  return (
    <div className="w-full bg-card rounded-2xl border border-border/50 shadow-xl overflow-hidden flex flex-col h-[400px]">
      
      {/* Tabs Header */}
      <div className="flex border-b border-border/50 bg-secondary/30">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-4 text-sm font-bold tracking-wider uppercase transition-colors relative",
              activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_10px_rgba(255,107,0,0.8)]" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto bg-background p-0">
        {activeTab === "history" && (
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 sticky top-0 font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Round ID</th>
                <th className="px-6 py-4">Crash Point</th>
                <th className="px-6 py-4">Hash</th>
                <th className="px-6 py-4 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {history?.map((round) => (
                <tr key={round.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="px-6 py-3 font-mono">#{round.id}</td>
                  <td className="px-6 py-3 font-mono font-bold">
                    <span className={cn(
                      round.crashedAt >= 5 ? "text-success" : 
                      round.crashedAt >= 2 ? "text-warning" : "text-destructive"
                    )}>
                      {round.crashedAt.toFixed(2)}x
                    </span>
                  </td>
                  <td className="px-6 py-3 font-mono text-muted-foreground text-xs">{round.hash.substring(0, 16)}...</td>
                  <td className="px-6 py-3 text-right text-muted-foreground">
                    {new Date(round.createdAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
              {!history?.length && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-muted-foreground">No history available</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {activeTab === "support" && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-display font-bold">Need Help?</h3>
            <p className="text-muted-foreground max-w-md">Our support team is available 24/7 to assist you with any issues regarding deposits, withdrawals, or gameplay.</p>
            <button className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-bold shadow-lg hover:bg-primary/90 transition-all">Start Live Chat</button>
          </div>
        )}

        {activeTab === "refer" && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
              <UserPlus className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-xl font-display font-bold">Refer & Earn</h3>
            <p className="text-muted-foreground max-w-md">Invite friends and earn 20% commission on house edge from all their bets for life.</p>
            <div className="flex gap-2 w-full max-w-sm mt-4">
              <input type="text" readOnly value="https://shinda.com/r/serria" className="flex-1 bg-secondary rounded-lg px-4 font-mono text-sm border border-border" />
              <button className="px-4 py-2 bg-success text-success-foreground rounded-lg font-bold hover:bg-success/90 transition-all">Copy</button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
