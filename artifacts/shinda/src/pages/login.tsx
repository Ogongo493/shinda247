import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { BrandLogo } from "@/components/brand-logo";

function normalizePhone(phone: string): string {
  if (phone.includes("@")) return phone.trim().toLowerCase();
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  return digits;
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaStage, setMfaStage] = useState<"login" | "setup" | "verify">("login");
  const [mfaCode, setMfaCode] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [authenticatorSecret, setAuthenticatorSecret] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizePhone(phone), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "Login failed", variant: "destructive" });
        return;
      }
      if (data.mfaSetupRequired) {
        setSetupToken(data.setupToken);
        setAuthenticatorSecret(data.authenticatorSecret);
        setMfaStage("setup");
        return;
      }
      if (data.mfaRequired) {
        setChallengeToken(data.challengeToken);
        setMfaStage("verify");
        return;
      }
      login(data.token, data.user);
      navigate(data.user?.isAdmin ? "/admin" : "/");
    } catch {
      toast({ title: "Error", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const isSetup = mfaStage === "setup";
      const res = await fetch(isSetup ? "/api/auth/admin/mfa/verify-setup" : "/api/auth/admin/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isSetup
          ? { setupToken, code: mfaCode }
          : { challengeToken, code: mfaCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Verification failed", description: data.error ?? "Check the code and try again.", variant: "destructive" });
        return;
      }
      if (isSetup) {
        toast({ title: "Authenticator enabled", description: "Sign in again with your password and authenticator code." });
        setMfaStage("login");
        setMfaCode("");
        setPassword("");
        setSetupToken("");
        setAuthenticatorSecret("");
        return;
      }
      login(data.token, data.user);
      navigate("/admin");
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
          {mfaStage === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone Number or Email</label>
                <Input type="text" placeholder="0712345678 or you@example.com" value={phone} onChange={e => setPhone(e.target.value)} className="h-12 text-base" required />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Password</label>
                <Input type="password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} className="h-12 text-base" required />
              </div>
              <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              {mfaStage === "setup" ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Add this key to Google Authenticator, Microsoft Authenticator, or another authenticator app. Keep it private.</p>
                  <div className="rounded-lg border border-border bg-background p-3 text-sm font-mono break-all select-all">{authenticatorSecret}</div>
                  <p className="text-xs text-muted-foreground">After adding the key, enter the six-digit code shown by your authenticator app.</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Enter the current six-digit code from your authenticator app.</p>
              )}
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Authenticator Code</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={mfaCode}
                  onChange={e => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="h-12 text-center text-xl tracking-[0.4em]"
                  required
                />
              </div>
              <Button type="submit" className="w-full h-12 text-base" disabled={loading || mfaCode.length !== 6}>
                {loading ? "Verifying..." : mfaStage === "setup" ? "Enable Authenticator" : "Verify and Sign In"}
              </Button>
              <button type="button" onClick={() => { setMfaStage("login"); setMfaCode(""); }} className="w-full text-sm text-muted-foreground hover:underline">
                Back to sign in
              </button>
            </form>
          )}

          {mfaStage === "login" && (
            <div className="border-t border-border/50 pt-4 text-center">
              <p className="text-sm text-muted-foreground">
                Don't have an account?{" "}
                <button onClick={() => navigate("/register")} className="text-primary font-semibold hover:underline">Register</button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
