"use client";
import { useState, useEffect } from "react";
import axios from "axios";
import { supabase } from "@/lib/supabase";

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

function Btn({ onClick, primary, mustard, disabled, children }: {
  onClick?: () => void; primary?: boolean; mustard?: boolean;
  disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: primary ? C.teal : mustard ? C.mustard : C.cream,
      color: (primary || mustard) ? "white" : C.ink,
      border: `2px solid ${C.ink}`, borderRadius: 14,
      boxShadow: `2px 2px 0 ${C.ink}`, padding: "10px 20px",
      fontWeight: 700, fontSize: 14,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: C.cream, border: `2px solid ${C.ink}`,
      borderRadius: 16, padding: "12px 14px",
      boxShadow: `3px 3px 0 ${C.ink}`,
      textAlign: "center", flex: 1,
    }}>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 15 }}>{value}</div>
    </div>
  );
}

const inputStyle = {
  width: "100%", border: `2px solid ${C.ink}`,
  borderRadius: 14, padding: "10px 14px",
  fontSize: 14, background: "white", outline: "none",
  boxSizing: "border-box" as const, marginBottom: 8,
};

type Tab = "dashboard" | "networth" | "cashflow" | "runway" | "save";

export default function NetWorthTracker({
  currency, onBack, user
}: {
  currency: string; onBack: () => void; user: any;
}) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [assets, setAssets] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [income, setIncome] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [emergencyFund, setEmergencyFund] = useState(0);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [restoring, setRestoring] = useState(true);

  const [aCat, setACat] = useState("Cash");
  const [aName, setAName] = useState("");
  const [aValue, setAValue] = useState(0);

  const [dType, setDType] = useState("Mortgage");
  const [dName, setDName] = useState("");
  const [dBalance, setDBalance] = useState(0);
  const [dInterest, setDInterest] = useState(0);

  const [iName, setIName] = useState("");
  const [iValue, setIValue] = useState(0);

  const [eName, setEName] = useState("");
  const [eValue, setEValue] = useState(0);
  const [eEssential, setEEssential] = useState(true);

  // Computed totals
  const assetsTotal = assets.reduce((s, a) => s + a.value, 0);
  const debtsTotal = debts.reduce((s, d) => s + d.balance, 0);
  const netWorth = assetsTotal - debtsTotal;
  const incomeTotal = income.reduce((s, i) => s + i.value, 0);
  const expenseTotal = expenses.reduce((s, e) => s + e.value, 0);
  const cashflow = incomeTotal - expenseTotal;
  const essentialTotal = expenses.filter(e => e.essential).reduce((s, e) => s + e.value, 0);
  const runway = essentialTotal > 0 ? emergencyFund / essentialTotal : 0;

  // ── Load last snapshot on mount ──────────────────────
  useEffect(() => {
    if (!user) { setRestoring(false); return; }
    supabase
      .from("networth_snapshots")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.payload?.inputs) {
          const inp = data.payload.inputs;
          setAssets(inp.assets ?? []);
          setDebts(inp.debts ?? []);
          setIncome(inp.income ?? []);
          setExpenses(inp.expenses ?? []);
          setEmergencyFund(inp.emergencyFund ?? 0);
          setNote(inp.note ?? "");
          setResult(data.payload.result ?? null);
        }
        setRestoring(false);
      });
  }, [user]);

  // ── Calculate + auto-save ────────────────────────────
  async function calculate() {
    setLoading(true);
    setSaveMsg("");
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/networth/calculate`, {
        month: new Date().toISOString().slice(0, 7),
        currency, assets_items: assets, debts_items: debts,
        income_items: income, expense_items: expenses,
        emergency_fund: emergencyFund, note,
      });
      setResult(res.data);
      setTab("dashboard");

      if (user) {
        const { error } = await supabase.from("networth_snapshots").insert({
          user_id: user.id,
          month: new Date().toISOString().slice(0, 7),
          currency,
          net_worth: res.data.net_worth,
          cashflow: res.data.cashflow,
          runway_months: res.data.runway_months,
          status: res.data.status,
          payload: {
            inputs: { assets, debts, income, expenses, emergencyFund, note },
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

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "networth", label: "Net Worth" },
    { key: "cashflow", label: "Cash Flow" },
    { key: "runway", label: "Runway" },
    { key: "save", label: "Save & Export" },
  ];

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.2rem" }}>
      <h1 style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: 4 }}>Net Worth Tracker</h1>

      {user && (
        <div style={{
          display: "inline-block", fontSize: 12, opacity: 0.6,
          border: `1px solid ${C.ink}`, borderRadius: 8,
          padding: "3px 10px", marginBottom: 12,
        }}>
          Signed in as <b>{user.email}</b>
        </div>
      )}

      <p style={{ fontSize: 13, opacity: 0.55, marginBottom: "1.2rem" }}>
        Tracks net worth, monthly cash flow, and financial runway.
      </p>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: tab === t.key ? C.ink : C.paper,
            color: tab === t.key ? C.paper : C.ink,
            border: `2px solid ${C.ink}`, borderRadius: 10,
            padding: "7px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {tab === "dashboard" && <>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <Metric label="Net worth" value={fmt(netWorth, currency)} />
          <Metric label="Cash flow" value={fmt(cashflow, currency)} />
          <Metric label="Runway" value={essentialTotal > 0 ? `${runway.toFixed(1)} mo` : "Set essentials"} />
        </div>

        <Card title="Pillar 1: Net worth">
          Assets: <b>{fmt(assetsTotal, currency)}</b><br />
          Debts: <b>{fmt(debtsTotal, currency)}</b>
        </Card>

        <Card title="Pillar 2: Cash flow (this month)">
          Income: <b>{fmt(incomeTotal, currency)}</b><br />
          Expenses: <b>{fmt(expenseTotal, currency)}</b>
        </Card>

        <Card title="Pillar 3: Financial runway">
          {essentialTotal <= 0
            ? <>Emergency fund: <b>{fmt(emergencyFund, currency)}</b><br />Essential expenses: <b>not set</b></>
            : <>
              Emergency fund: <b>{fmt(emergencyFund, currency)}</b><br />
              Essential expenses: <b>{fmt(essentialTotal, currency)}/mo</b><br />
              Runway: <b>{runway.toFixed(1)} months</b>
            </>
          }
        </Card>

        {result && (
          <Card title={`Status: ${result.status}`}
            bg={result.status === "Stable" ? C.teal : C.mustard}>
            <span style={{ color: "white" }}>{result.status_msg}</span>
          </Card>
        )}

        {saveMsg && (
          <div style={{
            fontSize: 13, marginBottom: 12, padding: "8px 14px",
            background: C.cream, border: `2px solid ${C.ink}`,
            borderRadius: 12, boxShadow: `2px 2px 0 ${C.ink}`,
          }}>{saveMsg}</div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <Btn onClick={onBack}>Back to home</Btn>
          <Btn primary onClick={calculate} disabled={loading}>
            {loading ? "Calculating..." : "Calculate"}
          </Btn>
        </div>
      </>}

      {/* ── Net Worth ── */}
      {tab === "networth" && <>
        <h2 style={{ fontWeight: 800, fontSize: "1.2rem", marginBottom: 10 }}>Assets</h2>
        <Card title="Add asset">
          <select value={aCat} onChange={e => setACat(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}>
            {["Cash", "Investments", "Property", "Other"].map(c => <option key={c}>{c}</option>)}
          </select>
          <input style={inputStyle} placeholder="Name (e.g. Savings account)"
            value={aName} onChange={e => setAName(e.target.value)} />
          <input type="number" style={inputStyle} placeholder={`Value (${currency})`}
            value={aValue || ""} onChange={e => setAValue(Number(e.target.value))} />
          <Btn primary onClick={() => {
            if (!aName.trim()) return;
            setAssets([...assets, { category: aCat, name: aName, value: aValue }]);
            setAName(""); setAValue(0);
          }}>Add asset</Btn>
        </Card>

        {assets.length === 0
          ? <p style={{ fontSize: 13, opacity: 0.5 }}>No assets yet.</p>
          : assets.map((a, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 14,
              padding: "10px 14px", boxShadow: `2px 2px 0 ${C.ink}`, marginBottom: 8,
            }}>
              <div>
                <div style={{ fontSize: 13, opacity: 0.6 }}>{a.category}</div>
                <div style={{ fontWeight: 700 }}>{a.name}</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 800 }}>{fmt(a.value, currency)}</div>
                <button onClick={() => setAssets(assets.filter((_, j) => j !== i))}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
            </div>
          ))}

        <hr style={{ border: "none", borderTop: `2px dashed rgba(27,27,27,0.12)`, margin: "16px 0" }} />
        <h2 style={{ fontWeight: 800, fontSize: "1.2rem", marginBottom: 10 }}>Debts</h2>
        <Card title="Add debt">
          <select value={dType} onChange={e => setDType(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}>
            {["Mortgage", "Loan", "Credit card", "Other"].map(c => <option key={c}>{c}</option>)}
          </select>
          <input style={inputStyle} placeholder="Name (e.g. Mortgage ABN)"
            value={dName} onChange={e => setDName(e.target.value)} />
          <input type="number" style={inputStyle} placeholder={`Balance (${currency})`}
            value={dBalance || ""} onChange={e => setDBalance(Number(e.target.value))} />
          <input type="number" style={inputStyle} placeholder="Interest rate (% per year)"
            value={dInterest || ""} onChange={e => setDInterest(Number(e.target.value))} />
          <Btn primary onClick={() => {
            if (!dName.trim()) return;
            setDebts([...debts, { type: dType, name: dName, balance: dBalance, interest: dInterest }]);
            setDName(""); setDBalance(0); setDInterest(0);
          }}>Add debt</Btn>
        </Card>

        {debts.length === 0
          ? <p style={{ fontSize: 13, opacity: 0.5 }}>No debts yet.</p>
          : debts.map((d, i) => {
            const good = d.type === "Mortgage" || d.interest < 4;
            return (
              <div key={i} style={{
                background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 16,
                padding: "10px 12px", boxShadow: `2px 2px 0 ${C.ink}`, marginBottom: 8,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{d.name}</div>
                    <div style={{ fontSize: 13 }}>{d.type} • {d.interest}%</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800 }}>{fmt(d.balance, currency)}</div>
                    <span style={{
                      display: "inline-block", padding: "2px 10px", borderRadius: 999,
                      background: good ? C.teal : C.mustard,
                      color: "white", fontSize: 12, fontWeight: 700,
                    }}>{good ? "Good" : "Bad"}</span>
                    <button onClick={() => setDebts(debts.filter((_, j) => j !== i))}
                      style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                </div>
              </div>
            );
          })}

        <hr style={{ border: "none", borderTop: `2px dashed rgba(27,27,27,0.12)`, margin: "16px 0" }} />
        <p style={{ fontSize: 14 }}>
          <b>Assets:</b> {fmt(assetsTotal, currency)} &nbsp;
          <b>Debts:</b> {fmt(debtsTotal, currency)} &nbsp;
          <b>Net worth:</b> {fmt(netWorth, currency)}
        </p>
      </>}

      {/* ── Cash Flow ── */}
      {tab === "cashflow" && <>
        <h2 style={{ fontWeight: 800, fontSize: "1.2rem", marginBottom: 4 }}>Monthly cash flow</h2>
        <p style={{ fontSize: 13, opacity: 0.55, marginBottom: 10 }}>
          Track income and expenses. Essentials are used for runway.
        </p>

        <Card title="Add income">
          <input style={inputStyle} placeholder="Name (e.g. Salary)"
            value={iName} onChange={e => setIName(e.target.value)} />
          <input type="number" style={inputStyle} placeholder={`Amount (${currency})`}
            value={iValue || ""} onChange={e => setIValue(Number(e.target.value))} />
          <Btn primary onClick={() => {
            if (!iName.trim()) return;
            setIncome([...income, { name: iName, value: iValue }]);
            setIName(""); setIValue(0);
          }}>Add income</Btn>
        </Card>

        {income.length === 0
          ? <p style={{ fontSize: 13, opacity: 0.5 }}>No income items yet.</p>
          : income.map((inc, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 14,
              padding: "10px 14px", boxShadow: `2px 2px 0 ${C.ink}`, marginBottom: 8,
            }}>
              <span style={{ fontWeight: 700 }}>{inc.name}</span>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontWeight: 800 }}>{fmt(inc.value, currency)}</span>
                <button onClick={() => setIncome(income.filter((_, j) => j !== i))}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
            </div>
          ))}

        <hr style={{ border: "none", borderTop: `2px dashed rgba(27,27,27,0.12)`, margin: "16px 0" }} />

        <Card title="Add expense">
          <input style={inputStyle} placeholder="Name (e.g. Rent)"
            value={eName} onChange={e => setEName(e.target.value)} />
          <input type="number" style={inputStyle} placeholder={`Amount (${currency})`}
            value={eValue || ""} onChange={e => setEValue(Number(e.target.value))} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={eEssential} onChange={e => setEEssential(e.target.checked)} />
            Essential expense
          </label>
          <Btn primary onClick={() => {
            if (!eName.trim()) return;
            setExpenses([...expenses, { name: eName, value: eValue, essential: eEssential }]);
            setEName(""); setEValue(0); setEEssential(true);
          }}>Add expense</Btn>
        </Card>

        {expenses.length === 0
          ? <p style={{ fontSize: 13, opacity: 0.5 }}>No expense items yet.</p>
          : expenses.map((exp, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 14,
              padding: "10px 14px", boxShadow: `2px 2px 0 ${C.ink}`, marginBottom: 8,
            }}>
              <div>
                <span style={{ fontWeight: 700 }}>{exp.name}</span>
                <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.6 }}>
                  {exp.essential ? "Essential" : "Discretionary"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontWeight: 800 }}>{fmt(exp.value, currency)}</span>
                <button onClick={() => setExpenses(expenses.filter((_, j) => j !== i))}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
            </div>
          ))}

        <hr style={{ border: "none", borderTop: `2px dashed rgba(27,27,27,0.12)`, margin: "16px 0" }} />
        <div style={{ display: "flex", gap: 10 }}>
          <Metric label="Income" value={fmt(incomeTotal, currency)} />
          <Metric label="Expenses" value={fmt(expenseTotal, currency)} />
          <Metric label="Cash flow" value={fmt(cashflow, currency)} />
        </div>
        <p style={{ fontSize: 13, opacity: 0.55, marginTop: 8 }}>
          Essential expenses used for runway: {fmt(essentialTotal, currency)}/mo
        </p>
      </>}

      {/* ── Runway ── */}
      {tab === "runway" && <>
        <h2 style={{ fontWeight: 800, fontSize: "1.2rem", marginBottom: 4 }}>Emergency fund and runway</h2>
        <p style={{ fontSize: 13, opacity: 0.55, marginBottom: 10 }}>
          Emergency fund is separate and should be liquid cash.
        </p>
        <Card title="Emergency fund">
          <input type="number" style={inputStyle}
            placeholder={`Liquid cash (${currency})`}
            value={emergencyFund || ""}
            onChange={e => setEmergencyFund(Number(e.target.value))} />
          <p style={{ fontSize: 12, opacity: 0.55, margin: 0 }}>
            Used to calculate your financial runway.
          </p>
        </Card>

        {essentialTotal <= 0
          ? <p style={{ fontSize: 13, opacity: 0.6 }}>
              ⚠️ Set at least one expense as Essential in Cash Flow to calculate runway.
            </p>
          : <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <Metric label="Essential expenses" value={`${fmt(essentialTotal, currency)}/mo`} />
              <Metric label="Runway" value={`${runway.toFixed(1)} months`} />
            </div>
        }

        <hr style={{ border: "none", borderTop: `2px dashed rgba(27,27,27,0.12)`, margin: "16px 0" }} />
        <h2 style={{ fontWeight: 800, fontSize: "1.1rem", marginBottom: 10 }}>Benchmarks</h2>
        <div style={{ display: "flex", gap: 10 }}>
          {[3, 6, 12].map(m => (
            <div key={m} style={{
              flex: 1, background: C.cream, border: `2px solid ${C.ink}`,
              borderRadius: 14, padding: "12px", boxShadow: `2px 2px 0 ${C.ink}`,
              textAlign: "center",
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{m} months</div>
              <div style={{ fontSize: 20 }}>{runway >= m ? "✅" : "⏳"}</div>
            </div>
          ))}
        </div>
      </>}

      {/* ── Save & Export ── */}
      {tab === "save" && <>
        <h2 style={{ fontWeight: 800, fontSize: "1.2rem", marginBottom: 4 }}>Save snapshot</h2>
        <p style={{ fontSize: 13, opacity: 0.55, marginBottom: 10 }}>
          {user
            ? "Your snapshot is saved automatically every time you calculate."
            : "Sign in from the home page to save your snapshots."}
        </p>

        <Card title="Note (optional)">
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="Add a note about this snapshot..."
            style={{ ...inputStyle, resize: "vertical", minHeight: 80, marginBottom: 0 }} />
        </Card>

        {result && (
          <Card title={`Status: ${result.status}`}
            bg={result.status === "Stable" ? C.teal : C.mustard}>
            <span style={{ color: "white" }}>{result.status_msg}</span>
          </Card>
        )}

        {saveMsg && (
          <div style={{
            fontSize: 13, marginBottom: 12, padding: "8px 14px",
            background: C.cream, border: `2px solid ${C.ink}`,
            borderRadius: 12, boxShadow: `2px 2px 0 ${C.ink}`,
          }}>{saveMsg}</div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <Btn onClick={onBack}>Back to home</Btn>
          <Btn primary onClick={calculate} disabled={loading}>
            {loading ? "Saving..." : "Calculate & Save"}
          </Btn>
        </div>
      </>}

    </main>
  );
}