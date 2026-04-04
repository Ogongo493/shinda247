import { useState } from "react";
import { formatCurrency, cn } from "@/lib/utils";
import { useGetGameHistory, getGetGameHistoryQueryKey } from "@workspace/api-client-react";
import { History, MessageSquare, UserPlus, ChevronDown, ChevronUp } from "lucide-react";

export function HistoryPanel() {
  const [activeTab,    setActiveTab]    = useState("history");
  const [mobileOpen,   setMobileOpen]   = useState(false);

  const { data: history } = useGetGameHistory(
    { limit: 15 },
    { query: { queryKey: getGetGameHistoryQueryKey({ limit: 15 }), refetchInterval: 10000 } }
  );

  const tabs = [
    { id: "history", label: "History",  icon: History },
    { id: "support", label: "Support",  icon: MessageSquare },
    { id: "refer",   label: "Refer",    icon: UserPlus },
  ];

  return (
    <div className="w-full bg-card rounded-2xl border border-border/50 shadow-xl overflow-hidden flex flex-col">

      {/* Tab header — always visible. On mobile doubles as expand toggle */}
      <div className="flex border-b border-border/50 bg-secondary/30 shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              if (activeTab === tab.id) {
                setMobileOpen(v => !v);
              } else {
                setActiveTab(tab.id);
                setMobileOpen(true);
              }
            }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold tracking-wider uppercase transition-colors relative",
              activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{tab.label}</span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_10px_rgba(255,107,0,0.8)]" />
            )}
          </button>
        ))}

        {/* Mobile expand/collapse toggle */}
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="md:hidden px-3 flex items-center text-muted-foreground"
        >
          {mobileOpen
            ? <ChevronUp className="w-4 h-4" />
            : <ChevronDown className="w-4 h-4" />
          }
        </button>
      </div>

      {/* Content — hidden by default on mobile, always shown on md+ */}
      <div className={cn(
        "overflow-auto bg-background",
        "hidden md:block",            // md+: always visible
        mobileOpen && "block",        // mobile: shown when expanded
        "max-h-[280px] md:max-h-[380px]"
      )}>
        {activeTab === "history" && (
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 sticky top-0 font-bold tracking-wider">
              <tr>
                <th className="px-3 py-3 md:px-5 md:py-3">Round</th>
                <th className="px-3 py-3 md:px-5 md:py-3">Crash</th>
                <th className="px-3 py-3 md:px-5 md:py-3 hidden sm:table-cell">Hash</th>
                <th className="px-3 py-3 md:px-5 md:py-3 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {history?.map((round) => (
                <tr key={round.id} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                  <td className="px-3 py-2 md:px-5 font-mono text-muted-foreground text-xs">#{round.id}</td>
                  <td className="px-3 py-2 md:px-5 font-mono font-bold">
                    <span className={cn(
                      "text-sm",
                      round.crashedAt >= 5 ? "text-success" :
                      round.crashedAt >= 2 ? "text-warning" : "text-destructive"
                    )}>
                      {round.crashedAt.toFixed(2)}x
                    </span>
                  </td>
                  <td className="px-3 py-2 md:px-5 font-mono text-muted-foreground text-xs hidden sm:table-cell">
                    {round.hash.substring(0, 12)}...
                  </td>
                  <td className="px-3 py-2 md:px-5 text-right text-muted-foreground text-xs">
                    {new Date(round.createdAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
              {!history?.length && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">No history yet</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {activeTab === "support" && (
          <div className="flex flex-col items-center justify-center py-8 px-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-base font-display font-bold">Need Help?</h3>
            <p className="text-muted-foreground text-sm">Our support team is available Mon–Sat, 8am–8pm EAT.</p>
            <a
              href="https://wa.me/254757007982"
              target="_blank"
              rel="noreferrer"
              className="px-5 py-2 bg-primary text-primary-foreground rounded-lg font-bold shadow-lg hover:bg-primary/90 transition-all text-sm"
            >
              WhatsApp 0757007982
            </a>
          </div>
        )}

        {activeTab === "refer" && (
          <div className="flex flex-col items-center justify-center py-8 px-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-success" />
            </div>
            <h3 className="text-base font-display font-bold">Refer & Earn</h3>
            <p className="text-muted-foreground text-sm">Invite friends and earn KES 50 for every friend who deposits.</p>
            <div className="flex gap-2 w-full max-w-xs">
              <input
                type="text"
                readOnly
                value="https://shinda247.app/r/join"
                className="flex-1 bg-secondary rounded-lg px-3 font-mono text-xs border border-border"
              />
              <button className="px-3 py-2 bg-success text-success-foreground rounded-lg font-bold hover:bg-success/90 transition-all text-sm">
                Copy
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
