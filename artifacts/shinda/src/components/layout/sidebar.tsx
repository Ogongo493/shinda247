import { Link, useLocation } from "wouter";
import { Home, Bell, History, Users, HelpCircle, Flame, Shield, Phone, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const NAV_ITEMS = [
  { href: "/",             label: "Home",          icon: Home },
  { href: "/history",      label: "History",       icon: History },
  { href: "/players",      label: "Players",       icon: Users },
  { href: "/notifications",label: "Alerts",        icon: Bell },
];

function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            Help & Support
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            Having issues? Our support team is available to help you.
          </p>
          <div className="bg-secondary/50 rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Phone className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Call or WhatsApp</p>
              <a href="tel:0757007982" className="text-lg font-bold font-mono text-foreground hover:text-primary transition-colors">
                0757007982
              </a>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">Available Mon–Sat, 8am–8pm EAT</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      {/* ── Desktop sidebar (md+) ─────────────────────────────────────── */}
      <aside className="w-64 h-full hidden md:flex flex-col bg-card border-r border-border/50 z-20">
        <div className="h-20 flex items-center px-6 border-b border-border/50">
          <div className="flex items-center gap-2 text-primary font-display font-bold text-2xl tracking-tighter">
            <Flame className="w-8 h-8 fill-primary" />
            <span>SHINDA<span className="text-foreground">24/7</span></span>
          </div>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-2">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20 shadow-[inset_0_0_20px_rgba(255,107,0,0.05)]"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive && "fill-primary/20")} />
                {item.label}
              </Link>
            );
          })}
          {user?.isAdmin && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium",
                location === "/admin"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Shield className="w-5 h-5" />
              Admin Panel
            </Link>
          )}
        </nav>

        <div className="p-4 mt-auto border-t border-border/50">
          <button
            onClick={() => setHelpOpen(true)}
            className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition-all duration-200 font-medium"
          >
            <HelpCircle className="w-5 h-5" />
            Help & Support
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom navigation (below md) ───────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border/50 flex items-stretch safe-area-pb">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors relative",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive && "fill-primary/20")} />
              <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
              {isActive && (
                <div className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-full" />
              )}
            </Link>
          );
        })}
        <button
          onClick={() => setHelpOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-3 text-muted-foreground transition-colors"
        >
          <HelpCircle className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Help</span>
        </button>
      </nav>

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
