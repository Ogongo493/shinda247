import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { BrandLogo } from "@/components/brand-logo";

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (/^0[17][0-9]{8}$/.test(digits)) return "254" + digits.slice(1);
  if (/^254[17][0-9]{8}$/.test(digits)) return digits;
  return "";
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
          <div className="mb-3 flex justify-center"><BrandLogo size="lg" /></div>
          <p className="text-muted-foreground">Create your account</p>
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-6 shadow-xl">
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="register-username" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Username</label>
              <Input
                id="register-username"
                autoComplete="username"
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
              <label htmlFor="register-phone" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone Number</label>
              <Input
                id="register-phone"
                autoComplete="tel"
                type="tel"
                inputMode="tel"
                placeholder="0712345678"
                pattern="(?:0[17][0-9]{8}|\+?254[17][0-9]{8})"
                title="Enter a Kenyan mobile number such as 0712345678, 0112345678, or +254712345678"
                minLength={10}
                maxLength={13}
                aria-describedby="register-phone-help"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="h-12 text-base"
                required
              />
              <p id="register-phone-help" className="text-xs text-muted-foreground">Kenyan mobile number (07xx or 01xx), or +254 format. Used for M-Pesa withdrawals.</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="register-password" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Password</label>
              <Input
                id="register-password"
                autoComplete="new-password"
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
              <label htmlFor="register-confirm-password" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Confirm Password</label>
              <Input
                id="register-confirm-password"
                autoComplete="new-password"
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
