"use client";
import { useState, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/lib/supabase";

const RATE_MAP: Record<string, number> = {
  "High (stocks 10%)": 0.10,
  "Medium (bonds 6%)": 0.06,
  "Low (savings 3%)": 0.03,
};

const C = {
  cream: "#FAF2DE", paper: "#FFF9EA",
  teal: "#1F8A86", mustard: "#E0B12E", ink: "#1B1B1B",
};

function fmt(value: number, currency: string) {
  const sym: Record<string, string> = { EUR: "€", IDR: "Rp", CNY: "¥" };
  const s = sym[currency] ?? "";
  if (currency === "IDR") return `${s}${value.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
  return `${s}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Card({ title, children, bg }: { title: string; children: React.ReactNode; bg?: string }) {
  return (
    <div style={{
      background: bg || C.cream, border: `2px solid ${C.ink}`,
      borderRadius: 18, padding: "14px 16px",
      boxShadow: `3px 3px 0 ${C.ink}`, marginBottom: 10,
    }}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.4 }}>{children}</div>
    </div>
  );
}

function Btn({ onClick, primary, disabled, children }: {
  onClick?: () => void; primary?: boolean; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: primary ? C.teal : C.cream,
      color: primary ? "white" : C.ink,
      border: `2px solid ${C.ink}`, borderRadius: 14,
      boxShadow: `2px 2px 0 ${C.ink}`, padding: "10px 20px",
      fontWeight: 700, fontSize: 14,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  );
}

function Metric({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{
      background: C.cream, border: `2px solid ${C.ink}`,
      borderRadius: 16, padding: "12px 14px",
      boxShadow: `3px 3px 0 ${C.ink}`,
      cursor: onClick ? "pointer" : "default",
      textAlign: "center", flex: 1,
    }}>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 16 }}>{value}</div>
    </div>
  );
}

const inputStyle = {
  width: "100%", border: `2px solid ${C.ink}`,
  borderRadius: 14, padding: "10px 14px",
  fontSize: 14, background: "white", outline: "none",
  boxSizing: "border-box" as const,
};

export default function RetirementCalculator({
  currency, onBack, user
}: {
  currency: string; onBack: () => void; user: any;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);
  const [monthly, setMonthly] = useState(0);
  const [wantMonthly, setWantMonthly] = useState(false);
  const [returnChoice, setReturnChoice] = useState("Medium (bonds 6%)");
  const [years, setYears] = useState(15);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [restoring, setRestoring] = useState(true);

  // ── Load last snapshot on mount ──────────────────────
  useEffect(() => {
    if (!user) { setRestoring(false); return; }
    supabase
      .from("retirement_snapshots")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.payload?.inputs) {
          const inp = data.payload.inputs;
          setName(inp.name ?? "");
          setAmount(inp.amount ?? 0);
          setMonthly(inp.monthly ?? 0);
          setWantMonthly(inp.wantMonthly ?? false);
          setReturnChoice(inp.returnChoice ?? "Medium (bonds 6%)");
          setYears(inp.years ?? 15);
          setResult(data.payload.result ?? null);
          if (data.payload.result) setStep(5);
        }
        setRestoring(false);
      });
  }, [user]);

  // ── Calculate + auto-save ────────────────────────────
  async function calculate() {
    setLoading(true);
    setSaveMsg("");
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/retirement/calculate`, {
        currency, current_net_worth: amount,
        monthly_contribution: wantMonthly ? monthly : 0,
        years, annual_return: RATE_MAP[returnChoice],
      });
      setResult(res.data);
      setStep(5);

      // Save to Supabase if logged in
      if (user) {
        const { error } = await supabase.from("retirement_snapshots").insert({
          user_id: user.id,
          currency,
          amount,
          monthly_contribution: wantMonthly ? monthly : 0,
          return_choice: returnChoice,
          target_years: years,
          projected_pot: res.data.fv,
          monthly_draw: res.data.monthly_drawdown,
          tier_name: res.data.tier_name,
          payload: {
            inputs: { name, amount, monthly, wantMonthly, returnChoice, years },
            result: res.data,
          },
        });
        setSaveMsg(error ? "⚠️ Could not save snapshot." : "✅ Snapshot saved!");
      } else {
        setSaveMsg("ℹ️ Sign in to save your results.");
      }
    } catch {
      alert("Could not connect to backend. Make sure uvicorn is running.");
    }
    setLoading(false);
  }

  if (restoring) return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.2rem" }}>
      <p style={{ opacity: 0.5 }}>Restoring your last session...</p>
    </main>
  );

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.2rem" }}>

      {/* User badge */}
      {user && (
        <div style={{
          display: "inline-block", fontSize: 12, opacity: 0.6,
          border: `1px solid ${C.ink}`, borderRadius: 8,
          padding: "3px 10px", marginBottom: 16,
        }}>
          Signed in as <b>{user.email}</b>
        </div>
      )}

      {/* Step 1 */}
      {step === 1 && <>
        <h1 style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: "1.2rem" }}>
          Retirement compound calculator
        </h1>
        <Card title="Step 1: Who are we planning for?">
          Tell me your name, we'll keep the flow simple and mobile-first.
          <input style={{ ...inputStyle, marginTop: 10 }}
            placeholder="Your name" value={name}
            onChange={e => setName(e.target.value)} />
        </Card>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <Btn onClick={onBack}>Back to home</Btn>
          <Btn primary disabled={!name.trim()} onClick={() => setStep(2)}>Continue ➜</Btn>
        </div>
      </>}

      {/* Step 2 */}
      {step === 2 && <>
        <h1 style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: "1.2rem" }}>
          Nice to meet you, {name || "friend"}!
        </h1>
        <Card title="Step 2: Starting point">
          <p style={{ margin: "0 0 8px" }}>Enter your current savings or investment balance.</p>
          <div style={{ marginBottom: 8, fontSize: 13, opacity: 0.6 }}>Currency: <b>{currency}</b></div>
          <input type="number" style={inputStyle} min={0}
            placeholder={`Starting amount (${currency})`}
            value={amount || ""}
            onChange={e => setAmount(Number(e.target.value))} />
        </Card>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <Btn onClick={() => setStep(1)}>Back</Btn>
          <Btn primary onClick={() => setStep(3)}>Continue ➜</Btn>
        </div>
      </>}

      {/* Step 3 */}
      {step === 3 && <>
        <h1 style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: "1.2rem" }}>Monthly investing</h1>
        <Card title="Step 3: Add monthly contributions?">
          <p style={{ margin: "0 0 12px" }}>
            Monthly investing (DCA) usually matters more than tiny return differences.
          </p>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            {["No", "Yes"].map(opt => (
              <Btn key={opt} primary={wantMonthly === (opt === "Yes")}
                onClick={() => setWantMonthly(opt === "Yes")}>{opt}</Btn>
            ))}
          </div>
          {wantMonthly && (
            <input type="number" style={inputStyle} min={0}
              placeholder={`Monthly amount (${currency})`}
              value={monthly || ""}
              onChange={e => setMonthly(Number(e.target.value))} />
          )}
        </Card>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <Btn onClick={() => setStep(2)}>Back</Btn>
          <Btn primary onClick={() => setStep(4)}>Continue ➜</Btn>
        </div>
      </>}

      {/* Step 4 */}
      {step === 4 && <>
        <h1 style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: "1.2rem" }}>
          Return profile and timeline
        </h1>
        <Card title="Step 4: Assumptions">
          <p style={{ margin: "0 0 10px" }}>
            Choose a return profile and target years. These are averages — reality varies.
          </p>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Return profile</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.keys(RATE_MAP).map(k => (
                <button key={k} onClick={() => setReturnChoice(k)} style={{
                  background: returnChoice === k ? C.teal : C.cream,
                  color: returnChoice === k ? "white" : C.ink,
                  border: `2px solid ${C.ink}`, borderRadius: 14,
                  boxShadow: `2px 2px 0 ${C.ink}`, padding: "10px 16px",
                  fontWeight: 700, fontSize: 14, textAlign: "left", cursor: "pointer",
                }}>{k}</button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            Target years from now: <span style={{ color: C.teal }}>{years}</span>
          </div>
          <input type="range" min={1} max={60} value={years}
            onChange={e => setYears(Number(e.target.value))}
            style={{ width: "100%", accentColor: C.teal }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.5 }}>
            <span>1 yr</span><span>60 yrs</span>
          </div>
        </Card>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <Btn onClick={() => setStep(3)}>Back</Btn>
          <Btn primary onClick={calculate} disabled={loading}>
            {loading ? "Calculating..." : "See results ➜"}
          </Btn>
        </div>
      </>}

      {/* Step 5: Results */}
      {step === 5 && result && <>
        <h1 style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: 6 }}>
          Your compound growth plan
        </h1>
        <p style={{ fontSize: 13, opacity: 0.6, marginBottom: "1.2rem" }}>
          Hi {name}! Currency: <b>{currency}</b> • Return: <b>{returnChoice}</b> • <b>{years} years</b>
        </p>

        {/* Save message */}
        {saveMsg && (
          <div style={{
            fontSize: 13, marginBottom: 12, padding: "8px 14px",
            background: C.cream, border: `2px solid ${C.ink}`,
            borderRadius: 12, boxShadow: `2px 2px 0 ${C.ink}`,
          }}>{saveMsg}</div>
        )}

        {/* Clickable metric cards */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <Metric label="Starting amount" value={fmt(amount, currency)} onClick={() => setStep(2)} />
          <Metric label="Monthly contribution" value={fmt(wantMonthly ? monthly : 0, currency)} onClick={() => setStep(3)} />
          <Metric label="Target" value={`${years} years`} onClick={() => setStep(4)} />
        </div>

        <hr style={{ border: "none", borderTop: `2px dashed rgba(27,27,27,0.12)`, margin: "16px 0" }} />

        <Card title={`Target outcome in ${years} years`}>
          <p><b>Projected pot:</b> {fmt(result.fv, currency)}</p>
          <p><b>4% rule draw:</b> {fmt(result.annual_drawdown, currency)}/yr
            (≈ {fmt(result.monthly_drawdown, currency)}/mo)</p>
          <p style={{ opacity: 0.85 }}>
            Inflation-adjusted (2.25%): {fmt(result.annual_drawdown_real, currency)}/yr
            (≈ {fmt(result.monthly_drawdown_real, currency)}/mo)
          </p>
          <p style={{ marginTop: 8 }}><b>Tier:</b> {result.tier_name}</p>
          <p style={{ opacity: 0.9 }}>{result.tier_desc}</p>
        </Card>

        <Card title="Lifestyle deep-dive">
          <div style={{ lineHeight: 1.6 }}>
            <ReactMarkdown>{result.lifestyle_md}</ReactMarkdown>
          </div>
        </Card>

        <p style={{ fontSize: 13, opacity: 0.55, margin: "12px 0" }}>
          Notes: Projections assume end-of-month contributions and a constant average return.
          Taxes and fees are ignored.
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <Btn onClick={() => setStep(4)}>← Edit</Btn>
          <Btn primary onClick={onBack}>Back to home</Btn>
        </div>
      </>}

    </main>
  );
}