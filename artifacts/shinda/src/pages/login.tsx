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

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();

  const [phone,    setPhone]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ phone: normalizePhone(phone), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "Login failed", variant: "destructive" });
        return;
      }
      login(data.token, data.user);
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
          <p className="text-muted-foreground">Sign in to your account</p>
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-6 shadow-xl">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="login-phone" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone Number</label>
              <Input
                id="login-phone"
                autoComplete="tel"
                type="tel"
                inputMode="tel"
                placeholder="0712345678"
                pattern="(?:0[17][0-9]{8}|\+?254[17][0-9]{8})"
                title="Enter a Kenyan mobile number such as 0712345678, 0112345678, or +254712345678"
                minLength={10}
                maxLength={13}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="h-12 text-base"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="login-password" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Password</label>
              <Input
                id="login-password"
                autoComplete="current-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="h-12 text-base"
                required
              />
            </div>
            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="border-t border-border/50 pt-4 text-center">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <button onClick={() => navigate("/register")} className="text-primary font-semibold hover:underline">
                Register
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
