import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ChevronDown, ChevronUp, HelpCircle, Shield, Wallet, Gamepad2, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

interface FAQItem {
  q: string;
  a: string;
}

interface FAQSection {
  title: string;
  icon: React.ElementType;
  items: FAQItem[];
}

const FAQ_SECTIONS: FAQSection[] = [
  {
    title: "How to Play",
    icon: Gamepad2,
    items: [
      {
        q: "How does Shinda 24/7 work?",
        a: "A rocket launches and a multiplier climbs from 1.00x upward. Place your bet before the round starts, then cash out at any multiplier before the rocket crashes. The higher you wait, the more you win — but if the rocket crashes before you cash out, you lose your bet.",
      },
      {
        q: "When can I place a bet?",
        a: "You can only place a bet during the Betting phase (countdown timer). Once the rocket launches (Flying phase), betting is closed. Wait for the next round.",
      },
      {
        q: "What is Auto Cash Out?",
        a: "Set a multiplier (e.g. 2.00x) and the system will automatically cash you out when the rocket reaches that multiplier. This is useful if you can't watch the screen the whole time.",
      },
      {
        q: "What are the minimum and maximum bets?",
        a: "Minimum bet is KES 50. Maximum bet is KES 50,000 per round.",
      },
      {
        q: "Can I place more than one bet per round?",
        a: "No. Each player can place one bet per round. You can place a new bet after the current round ends.",
      },
    ],
  },
  {
    title: "Deposits & Withdrawals",
    icon: Wallet,
    items: [
      {
        q: "How do I deposit money?",
        a: "Tap the Deposit button, enter your M-Pesa phone number and amount, then tap Deposit Now. You will receive an M-Pesa STK push on your phone — enter your PIN to complete. Funds appear in your wallet instantly after confirmation.",
      },
      {
        q: "How do I withdraw my winnings?",
        a: "Tap the Withdraw button, enter your M-Pesa phone number and the amount, then tap Withdraw Now. The money is sent directly to your M-Pesa. Withdrawals typically arrive within 1 minute.",
      },
      {
        q: "What is the minimum deposit and withdrawal?",
        a: "Minimum deposit: KES 10. Minimum withdrawal: KES 50. Maximum for both: KES 150,000.",
      },
      {
        q: "My deposit did not reflect. What do I do?",
        a: "Wait 2–3 minutes for M-Pesa to confirm the transaction. If your balance still has not updated, contact support with your M-Pesa receipt number.",
      },
      {
        q: "My withdrawal has not arrived. What do I do?",
        a: "Withdrawals usually arrive within 1–3 minutes. If it takes longer than 10 minutes, contact our support team with your phone number and withdrawal amount.",
      },
    ],
  },
  {
    title: "Provably Fair",
    icon: Shield,
    items: [
      {
        q: "Is the game fair?",
        a: "Yes. Shinda 24/7 uses a SHA-256 hash chain to determine crash points before each round starts. The game hash is published before launch — you can verify any round's crash point independently using the hash.",
      },
      {
        q: "How do I verify a round?",
        a: "Go to the History page, find any round and copy its hash. The crash point is computed as: h = parseInt(hash[0..7], 16). If h % 33 === 0 → crash at 1.00x. Otherwise → floor((100 × 2³² − h) / (2³² − h)) / 100.",
      },
      {
        q: "Can the house manipulate crash points?",
        a: "No. The crash point for each round is locked in the hash before the round begins and cannot be changed. The hash is shown to players — any manipulation would produce a different hash that anyone can detect.",
      },
    ],
  },
  {
    title: "Account & Security",
    icon: HelpCircle,
    items: [
      {
        q: "How do I change my password?",
        a: "Tap your profile avatar → Change Password. Enter your current password, then your new password twice. Tap Update Password.",
      },
      {
        q: "I forgot my password. What do I do?",
        a: "Contact support via WhatsApp on 0757007982 with your phone number and username. Our team will verify your identity and reset your password.",
      },
      {
        q: "Can I have more than one account?",
        a: "No. Each phone number can only be linked to one account. Multiple accounts are not allowed and may result in suspension.",
      },
      {
        q: "My account has been suspended. What do I do?",
        a: "Contact support on 0757007982 to find out the reason and resolve the issue.",
      },
    ],
  },
];

function FAQAccordion({ items }: { items: FAQItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="divide-y divide-border/30">
      {items.map((item, i) => (
        <div key={i}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-secondary/30 transition-colors"
          >
            <span className="text-sm font-semibold pr-4">{item.q}</span>
            {open === i
              ? <ChevronUp className="w-4 h-4 text-primary shrink-0" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            }
          </button>
          {open === i && (
            <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function FAQPage() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Topbar />

        {/* Page header */}
        <div className="h-14 flex items-center px-6 border-b border-border/50 bg-card shrink-0">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-display font-bold">FAQ & Help</h1>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 space-y-6">
          <div className="max-w-2xl mx-auto w-full space-y-4">

            {/* Support card */}
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Phone className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm">Need direct help?</p>
                <p className="text-xs text-muted-foreground mb-1">WhatsApp or call our support team</p>
                <a href="https://wa.me/254757007982" target="_blank" rel="noreferrer"
                  className="text-primary font-bold font-mono text-sm hover:underline">
                  0757007982
                </a>
                <span className="text-xs text-muted-foreground ml-2">Mon–Sat, 8am–8pm EAT</span>
              </div>
            </div>

            {/* FAQ sections */}
            {FAQ_SECTIONS.map((section) => (
              <div key={section.title} className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50 bg-secondary/30">
                  <section.icon className="w-4 h-4 text-primary" />
                  <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">{section.title}</h2>
                </div>
                <FAQAccordion items={section.items} />
              </div>
            ))}

          </div>
        </main>
      </div>
    </div>
  );
}
