import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
  userPhone?: string;
}

export function DepositModal({ open, onClose, userPhone }: DepositModalProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [phone, setPhone] = useState(userPhone ?? "");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/mpesa/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone, amountKes: parseFloat(amount) }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Deposit Failed", description: data.error, variant: "destructive" }); return; }
      toast({ title: "STK Push Sent", description: "Check your phone and enter your M-Pesa PIN to complete the deposit." });
      onClose();
    } catch {
      toast({ title: "Error", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const quickAmounts = [100, 200, 500, 1000, 2000, 5000];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Deposit via M-Pesa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleDeposit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">M-Pesa Phone Number</label>
            <Input
              type="tel"
              placeholder="0712345678"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="h-12"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Amount (KES)</label>
            <Input
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min={10}
              max={150000}
              className="h-12 text-lg"
              required
            />
            <div className="grid grid-cols-3 gap-2">
              {quickAmounts.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAmount(String(a))}
                  className="py-1.5 bg-secondary hover:bg-secondary/80 rounded-md text-xs font-mono font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                  {a.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full h-12" disabled={loading}>
            {loading ? "Sending STK Push..." : "Deposit Now"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">Min KES 10 · Max KES 150,000</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface WithdrawModalProps {
  open: boolean;
  onClose: () => void;
  userPhone?: string;
  balance: number;
}

export function WithdrawModal({ open, onClose, userPhone, balance }: WithdrawModalProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [phone, setPhone] = useState(userPhone ?? "");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/mpesa/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone, amountKes: parseFloat(amount) }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Withdrawal Failed", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Withdrawal Initiated", description: data.message });
      onClose();
    } catch {
      toast({ title: "Error", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Withdraw to M-Pesa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleWithdraw} className="space-y-4 mt-2">
          <div className="bg-secondary/50 rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Available Balance</p>
            <p className="text-2xl font-mono font-bold text-foreground">KES {balance.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Send to Phone</label>
            <Input
              type="tel"
              placeholder="0712345678"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="h-12"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Amount (KES)</label>
            <Input
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min={50}
              max={Math.min(150000, balance)}
              className="h-12 text-lg"
              required
            />
          </div>
          <Button type="submit" variant="secondary" className="w-full h-12 border border-border" disabled={loading}>
            {loading ? "Processing..." : "Withdraw Now"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">Min KES 50 · Max KES 150,000</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
