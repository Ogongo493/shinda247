import { useState } from "react";
import { useLocation } from "wouter";
import { Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0"))   return "254" + digits.slice(1);
  return digits;
}

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [phone,    setPhone]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirm) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username, phone: normalizePhone(phone), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "Registration failed", variant: "destructive" });
        return;
      }
      login(data.token, data.user);
      toast({ title: "Welcome!", description: `Account created. Welcome, ${data.user.username}!` });
      navigate("/");
    } catch {
      toast({ title: "Error", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-primary font-display font-bold text-3xl tracking-tighter mb-2">
            <Flame className="w-10 h-10 fill-primary" />
            <span>SHINDA<span className="text-foreground">24/7</span></span>
          </div>
          <p className="text-muted-foreground">Create your account</p>
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-6 shadow-xl">
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Username</label>
              <Input
                type="text"
                placeholder="player_one"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="h-12 text-base"
                minLength={3}
                maxLength={32}
                pattern="[a-zA-Z0-9_]+"
                title="Letters, numbers, and underscores only"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone Number</label>
              <Input
                type="tel"
                placeholder="0712345678"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="h-12 text-base"
                required
              />
              <p className="text-xs text-muted-foreground">Kenyan number (07xx or 01xx) — used for M-Pesa withdrawals</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Password</label>
              <Input
                type="password"
                placeholder="Min. 6 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="h-12 text-base"
                minLength={6}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Confirm Password</label>
              <Input
                type="password"
                placeholder="Repeat your password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="h-12 text-base"
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </form>

          <div className="border-t border-border/50 pt-4 text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <button onClick={() => navigate("/login")} className="text-primary font-semibold hover:underline">
                Sign In
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
