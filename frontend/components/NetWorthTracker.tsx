"use client";
import { useState, useEffect } from "react";
import axios from "axios";
import { supabase } from "@/lib/supabase";

const C = {
  cream: "#FAF2DE", paper: "#FFF9EA",
  teal: "#1F8A86", mustard: "#E0B12E", ink: "#1B1B1B",
};

const MESSAGES: Record<string, any> = {
  en: require("@/messages/en.json"),
  id: require("@/messages/id.json"),
  zh: require("@/messages/zh.json"),
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
  currency, onBack, user, locale = "en",
}: {
  currency: string; onBack: () => void; user: any; locale?: string;
}) {
  const t = (MESSAGES[locale] || MESSAGES.en).networth;

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

  const [aCat, setACat] = useState(0); // index into t.asset_categories
  const [aName, setAName] = useState("");
  const [aValue, setAValue] = useState(0);

  const [dType, setDType] = useState(0); // index into t.debt_types
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
        setSaveMsg(error ? t.save_error : t.save_success);
      } else {
        setSaveMsg(t.save_signin);
      }
    } catch {
      alert("Could not connect to backend. Make sure uvicorn is running.");
    }
    setLoading(false);
  }

  if (restoring) return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.2rem" }}>
      <p style={{ opacity: 0.5 }}>{t.restoring}</p>
    </main>
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: t.tab_dashboard },
    { key: "networth", label: t.tab_networth },
    { key: "cashflow", label: t.tab_cashflow },
    { key: "runway", label: t.tab_runway },
    { key: "save", label: t.tab_save },
  ];

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.2rem" }}>
      <h1 style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: 4 }}>{t.title}</h1>

      {user && (
        <div style={{
          display: "inline-block", fontSize: 12, opacity: 0.6,
          border: `1px solid ${C.ink}`, borderRadius: 8,
          padding: "3px 10px", marginBottom: 12,
        }}>
          {t.signed_in_as} <b>{user.email}</b>
        </div>
      )}

      <p style={{ fontSize: 13, opacity: 0.55, marginBottom: "1.2rem" }}>{t.subtitle}</p>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {tabs.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)} style={{
            background: tab === tb.key ? C.ink : C.paper,
            color: tab === tb.key ? C.paper : C.ink,
            border: `2px solid ${C.ink}`, borderRadius: 10,
            padding: "7px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer",
          }}>{tb.label}</button>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {tab === "dashboard" && <>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <Metric label={t.metric_networth} value={fmt(netWorth, currency)} />
          <Metric label={t.metric_cashflow} value={fmt(cashflow, currency)} />
          <Metric label={t.metric_runway} value={essentialTotal > 0 ? `${runway.toFixed(1)} mo` : t.set_essentials} />
        </div>

        <Card title={t.pillar1_title}>
          {t.pillar1_assets} <b>{fmt(assetsTotal, currency)}</b><br />
          {t.pillar1_debts} <b>{fmt(debtsTotal, currency)}</b>
        </Card>

        <Card title={t.pillar2_title}>
          {t.pillar2_income} <b>{fmt(incomeTotal, currency)}</b><br />
          {t.pillar2_expenses} <b>{fmt(expenseTotal, currency)}</b>
        </Card>

        <Card title={t.pillar3_title}>
          {essentialTotal <= 0
            ? <>{t.pillar3_emergency} <b>{fmt(emergencyFund, currency)}</b><br />{t.pillar3_essential} <b>{t.pillar3_not_set}</b></>
            : <>
              {t.pillar3_emergency} <b>{fmt(emergencyFund, currency)}</b><br />
              {t.pillar3_essential} <b>{fmt(essentialTotal, currency)}/mo</b><br />
              {t.pillar3_runway} <b>{runway.toFixed(1)} {t.pillar3_months}</b>
            </>
          }
        </Card>

        {result && (
          <Card title={`${t.status_prefix} ${result.status}`}
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
          <Btn onClick={onBack}>{t.back_home}</Btn>
          <Btn primary onClick={calculate} disabled={loading}>
            {loading ? t.calculating : t.calculate}
          </Btn>
        </div>
      </>}

      {/* ── Net Worth ── */}
      {tab === "networth" && <>
        <h2 style={{ fontWeight: 800, fontSize: "1.2rem", marginBottom: 10 }}>{t.assets_title}</h2>
        <Card title={t.add_asset_card}>
          <select value={aCat} onChange={e => setACat(Number(e.target.value))}
            style={{ ...inputStyle, cursor: "pointer" }}>
            {t.asset_categories.map((c: string, i: number) => <option key={i} value={i}>{c}</option>)}
          </select>
          <input style={inputStyle} placeholder={t.asset_name_placeholder}
            value={aName} onChange={e => setAName(e.target.value)} />
          <input type="number" style={inputStyle}
            placeholder={t.asset_value_placeholder.replace("{currency}", currency)}
            value={aValue || ""} onChange={e => setAValue(Number(e.target.value))} />
          <Btn primary onClick={() => {
            if (!aName.trim()) return;
            setAssets([...assets, { category: t.asset_categories[aCat], name: aName, value: aValue }]);
            setAName(""); setAValue(0);
          }}>{t.add_asset_btn}</Btn>
        </Card>

        {assets.length === 0
          ? <p style={{ fontSize: 13, opacity: 0.5 }}>{t.no_assets}</p>
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
        <h2 style={{ fontWeight: 800, fontSize: "1.2rem", marginBottom: 10 }}>{t.debts_title}</h2>
        <Card title={t.add_debt_card}>
          <select value={dType} onChange={e => setDType(Number(e.target.value))}
            style={{ ...inputStyle, cursor: "pointer" }}>
            {t.debt_types.map((c: string, i: number) => <option key={i} value={i}>{c}</option>)}
          </select>
          <input style={inputStyle} placeholder={t.debt_name_placeholder}
            value={dName} onChange={e => setDName(e.target.value)} />
          <input type="number" style={inputStyle}
            placeholder={t.debt_balance_placeholder.replace("{currency}", currency)}
            value={dBalance || ""} onChange={e => setDBalance(Number(e.target.value))} />
          <input type="number" style={inputStyle} placeholder={t.debt_interest_placeholder}
            value={dInterest || ""} onChange={e => setDInterest(Number(e.target.value))} />
          <Btn primary onClick={() => {
            if (!dName.trim()) return;
            setDebts([...debts, { type: t.debt_types[dType], name: dName, balance: dBalance, interest: dInterest }]);
            setDName(""); setDBalance(0); setDInterest(0);
          }}>{t.add_debt_btn}</Btn>
        </Card>

        {debts.length === 0
          ? <p style={{ fontSize: 13, opacity: 0.5 }}>{t.no_debts}</p>
          : debts.map((d, i) => {
            const good = d.type === "Mortgage" || d.type === t.debt_types[0] || d.interest < 4;
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
                    }}>{good ? t.debt_good : t.debt_bad}</span>
                    <button onClick={() => setDebts(debts.filter((_, j) => j !== i))}
                      style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                </div>
              </div>
            );
          })}

        <hr style={{ border: "none", borderTop: `2px dashed rgba(27,27,27,0.12)`, margin: "16px 0" }} />
        <p style={{ fontSize: 14 }}>
          <b>{t.nw_assets}</b> {fmt(assetsTotal, currency)} &nbsp;
          <b>{t.nw_debts}</b> {fmt(debtsTotal, currency)} &nbsp;
          <b>{t.nw_net}</b> {fmt(netWorth, currency)}
        </p>
      </>}

      {/* ── Cash Flow ── */}
      {tab === "cashflow" && <>
        <h2 style={{ fontWeight: 800, fontSize: "1.2rem", marginBottom: 4 }}>{t.cashflow_title}</h2>
        <p style={{ fontSize: 13, opacity: 0.55, marginBottom: 10 }}>{t.cashflow_subtitle}</p>

        <Card title={t.add_income_card}>
          <input style={inputStyle} placeholder={t.income_name_placeholder}
            value={iName} onChange={e => setIName(e.target.value)} />
          <input type="number" style={inputStyle}
            placeholder={t.income_amount_placeholder.replace("{currency}", currency)}
            value={iValue || ""} onChange={e => setIValue(Number(e.target.value))} />
          <Btn primary onClick={() => {
            if (!iName.trim()) return;
            setIncome([...income, { name: iName, value: iValue }]);
            setIName(""); setIValue(0);
          }}>{t.add_income_btn}</Btn>
        </Card>

        {income.length === 0
          ? <p style={{ fontSize: 13, opacity: 0.5 }}>{t.no_income}</p>
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

        <Card title={t.add_expense_card}>
          <input style={inputStyle} placeholder={t.expense_name_placeholder}
            value={eName} onChange={e => setEName(e.target.value)} />
          <input type="number" style={inputStyle}
            placeholder={t.expense_amount_placeholder.replace("{currency}", currency)}
            value={eValue || ""} onChange={e => setEValue(Number(e.target.value))} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={eEssential} onChange={e => setEEssential(e.target.checked)} />
            {t.essential_label}
          </label>
          <Btn primary onClick={() => {
            if (!eName.trim()) return;
            setExpenses([...expenses, { name: eName, value: eValue, essential: eEssential }]);
            setEName(""); setEValue(0); setEEssential(true);
          }}>{t.add_expense_btn}</Btn>
        </Card>

        {expenses.length === 0
          ? <p style={{ fontSize: 13, opacity: 0.5 }}>{t.no_expenses}</p>
          : expenses.map((exp, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 14,
              padding: "10px 14px", boxShadow: `2px 2px 0 ${C.ink}`, marginBottom: 8,
            }}>
              <div>
                <span style={{ fontWeight: 700 }}>{exp.name}</span>
                <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.6 }}>
                  {exp.essential ? t.essential_tag : t.discretionary_tag}
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
          <Metric label={t.income_label} value={fmt(incomeTotal, currency)} />
          <Metric label={t.expenses_label} value={fmt(expenseTotal, currency)} />
          <Metric label={t.cashflow_label} value={fmt(cashflow, currency)} />
        </div>
        <p style={{ fontSize: 13, opacity: 0.55, marginTop: 8 }}>
          {t.essential_used.replace("{amount}", fmt(essentialTotal, currency))}
        </p>
      </>}

      {/* ── Runway ── */}
      {tab === "runway" && <>
        <h2 style={{ fontWeight: 800, fontSize: "1.2rem", marginBottom: 4 }}>{t.runway_title}</h2>
        <p style={{ fontSize: 13, opacity: 0.55, marginBottom: 10 }}>{t.runway_subtitle}</p>
        <Card title={t.emergency_card}>
          <input type="number" style={inputStyle}
            placeholder={t.emergency_placeholder.replace("{currency}", currency)}
            value={emergencyFund || ""}
            onChange={e => setEmergencyFund(Number(e.target.value))} />
          <p style={{ fontSize: 12, opacity: 0.55, margin: 0 }}>{t.emergency_desc}</p>
        </Card>

        {essentialTotal <= 0
          ? <p style={{ fontSize: 13, opacity: 0.6 }}>{t.runway_warning}</p>
          : <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <Metric label={t.essential_expenses_label} value={`${fmt(essentialTotal, currency)}/mo`} />
              <Metric label={t.runway_label} value={`${runway.toFixed(1)} ${t.runway_months_suffix}`} />
            </div>
        }

        <hr style={{ border: "none", borderTop: `2px dashed rgba(27,27,27,0.12)`, margin: "16px 0" }} />
        <h2 style={{ fontWeight: 800, fontSize: "1.1rem", marginBottom: 10 }}>{t.benchmarks_title}</h2>
        <div style={{ display: "flex", gap: 10 }}>
          {[3, 6, 12].map(m => (
            <div key={m} style={{
              flex: 1, background: C.cream, border: `2px solid ${C.ink}`,
              borderRadius: 14, padding: "12px", boxShadow: `2px 2px 0 ${C.ink}`,
              textAlign: "center",
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{m} {t.runway_months_suffix}</div>
              <div style={{ fontSize: 20 }}>{runway >= m ? "✅" : "⏳"}</div>
            </div>
          ))}
        </div>
      </>}

      {/* ── Save & Export ── */}
      {tab === "save" && <>
        <h2 style={{ fontWeight: 800, fontSize: "1.2rem", marginBottom: 4 }}>{t.save_title}</h2>
        <p style={{ fontSize: 13, opacity: 0.55, marginBottom: 10 }}>
          {user ? t.save_subtitle_user : t.save_subtitle_guest}
        </p>

        <Card title={t.note_card}>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder={t.note_placeholder}
            style={{ ...inputStyle, resize: "vertical", minHeight: 80, marginBottom: 0 }} />
        </Card>

        {result && (
          <Card title={`${t.status_prefix} ${result.status}`}
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
          <Btn onClick={onBack}>{t.back_home}</Btn>
          <Btn primary onClick={calculate} disabled={loading}>
            {loading ? t.saving : t.calculate_save_btn}
          </Btn>
        </div>
      </>}

    </main>
  );
}
