"use client";
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { supabase } from "@/lib/supabase";

const C = {
  cream: "#FAF2DE", paper: "#FFF9EA",
  teal: "#1F8A86", mustard: "#E0B12E", ink: "#1B1B1B",
  coral: "#E8593C",
};

const MESSAGES: Record<string, any> = {
  en: require("@/messages/en.json"),
  id: require("@/messages/id.json"),
  zh: require("@/messages/zh.json"),
};

// ── Formatting ────────────────────────────────────────
function fmt(value: number, currency: string) {
  const sym: Record<string, string> = { EUR: "€", IDR: "Rp", CNY: "¥" };
  const s = sym[currency] ?? "";
  if (currency === "IDR") return `${s}${value.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
  return `${s}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtShort(value: number, currency: string) {
  const sym: Record<string, string> = { EUR: "€", IDR: "Rp", CNY: "¥" };
  const s = sym[currency] ?? "";
  if (Math.abs(value) >= 1e6) return `${s}${(value / 1e6).toFixed(2)}M`;
  if (Math.abs(value) >= 1e3) return `${s}${Math.round(value / 1e3)}K`;
  return `${s}${Math.round(value)}`;
}

// ── Sub-components ────────────────────────────────────
function Card({ title, children, bg }: { title: string; children: React.ReactNode; bg?: string }) {
  return (
    <div style={{ background: bg || C.cream, border: `2px solid ${C.ink}`, borderRadius: 18, padding: "14px 16px", boxShadow: `3px 3px 0 ${C.ink}`, marginBottom: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.4 }}>{children}</div>
    </div>
  );
}
function Btn({ onClick, primary, mustard, disabled, children }: { onClick?: () => void; primary?: boolean; mustard?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: primary ? C.teal : mustard ? C.mustard : C.cream,
      color: (primary || mustard) ? "white" : C.ink,
      border: `2px solid ${C.ink}`, borderRadius: 14, boxShadow: `2px 2px 0 ${C.ink}`,
      padding: "10px 20px", fontWeight: 700, fontSize: 14,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
      fontFamily: "'IBM Plex Mono', monospace",
    }}>{children}</button>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 16, padding: "12px 14px", boxShadow: `3px 3px 0 ${C.ink}`, textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 15 }}>{value}</div>
    </div>
  );
}

const inputStyle = {
  width: "100%", border: `2px solid ${C.ink}`, borderRadius: 14, padding: "10px 14px",
  fontSize: 14, background: "white", outline: "none", boxSizing: "border-box" as const, marginBottom: 8,
};

// ── Chart.js loader ───────────────────────────────────
let cjsLoaded = false;
let cjsLoading: Promise<void> | null = null;
function loadChartJS(): Promise<void> {
  if (cjsLoaded) return Promise.resolve();
  if (cjsLoading) return cjsLoading;
  cjsLoading = new Promise<void>((resolve) => {
    if ((window as any).Chart) { cjsLoaded = true; resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
    s.onload = () => { cjsLoaded = true; resolve(); };
    document.head.appendChild(s);
  });
  return cjsLoading;
}

// ── jsPDF loader ──────────────────────────────────────
function loadJsPDF(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).jspdf) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

// ── SheetJS loader ────────────────────────────────────
function loadXLSX(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).XLSX) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

// ── Export helpers ────────────────────────────────────
async function exportPDF(snap: any, currency: string) {
  await loadJsPDF();
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF();
  const inp = snap.payload?.inputs ?? {};
  const res = snap.payload?.result ?? {};
  const month = snap.month ?? "Unknown";
  const fmtV = (v: number) => fmt(v, currency);

  let y = 18;
  const lh = 7;
  const indent = 14;
  const pageH = 280; // safe bottom margin before new page

  const checkPage = () => {
    if (y > pageH) { doc.addPage(); y = 18; }
  };
  const title = (text: string) => {
    checkPage();
    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text(text, indent, y); y += lh + 2;
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  };
  const sectionHead = (text: string) => {
    y += 3; checkPage();
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(text, indent, y); y += lh;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  };
  const row = (label: string, value: string, sub?: string) => {
    checkPage();
    doc.text(label, indent + 2, y);
    doc.text(value, 180, y, { align: "right" });
    y += lh - 1;
    if (sub) { checkPage(); doc.setFontSize(9); doc.setTextColor(120); doc.text(sub, indent + 4, y); doc.setFontSize(10); doc.setTextColor(0); y += lh - 2; }
  };
  const divider = () => { checkPage(); doc.setDrawColor(200); doc.line(indent, y, 195, y); y += 4; };

  // Header
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text("Net Worth Snapshot", indent, y); y += 9;
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(`Month: ${month}   Status: ${res.status ?? "—"}`, indent, y); y += 8;
  divider();

  // Summary
  sectionHead("Summary");
  row("Net worth", fmtV(res.net_worth ?? 0));
  row("Cash flow", fmtV(res.cashflow ?? 0) + "/mo");
  row("Runway", (res.runway_months ?? 0).toFixed(1) + " months");
  row("Assets total", fmtV(res.assets_total ?? 0));
  row("Debts total", fmtV(res.debts_total ?? 0));
  divider();

  // Assets
  sectionHead("Assets");
  (inp.assets ?? []).forEach((a: any) => row(a.name, fmtV(a.value), a.category));
  row("Total assets", fmtV(inp.assets?.reduce((s: number, a: any) => s + a.value, 0) ?? 0));
  divider();

  // Debts
  sectionHead("Debts");
  (inp.debts ?? []).forEach((d: any) => row(d.name, fmtV(d.balance), `${d.type} · ${d.interest}%`));
  row("Total debts", fmtV(inp.debts?.reduce((s: number, d: any) => s + d.balance, 0) ?? 0));
  divider();

  // Income
  sectionHead("Monthly Income");
  (inp.income ?? []).forEach((i: any) => row(i.name, fmtV(i.value)));
  row("Total income", fmtV(inp.income?.reduce((s: number, i: any) => s + i.value, 0) ?? 0));
  divider();

  // Expenses
  sectionHead("Monthly Expenses");
  (inp.expenses ?? []).forEach((e: any) => row(e.name, fmtV(e.value), e.essential ? "Essential" : "Discretionary"));
  row("Total expenses", fmtV(inp.expenses?.reduce((s: number, e: any) => s + e.value, 0) ?? 0));
  divider();

  // Emergency fund + note
  sectionHead("Emergency Fund");
  row("Liquid cash reserve", fmtV(inp.emergencyFund ?? 0));
  if (inp.note) {
    y += 3;
    doc.setFont("helvetica", "italic"); doc.setFontSize(10);
    doc.text(`Note: "${inp.note}"`, indent, y); y += lh;
    doc.setFont("helvetica", "normal");
  }

  // Footer on last page
  y += 8;
  checkPage();
  doc.setFontSize(9); doc.setTextColor(150);
  doc.text("Generated by When do I Retired · whenretired.app", indent, y);

  doc.save(`networth-${month}.pdf`);
}

async function exportExcel(snap: any, currency: string) {
  await loadXLSX();
  const XLSX = (window as any).XLSX;
  const inp = snap.payload?.inputs ?? {};
  const res = snap.payload?.result ?? {};
  const month = snap.month ?? "Unknown";
  const fmtV = (v: number) => fmt(v, currency);

  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summary = [
    ["Net Worth Snapshot", month],
    [],
    ["Metric", "Value"],
    ["Net worth", fmtV(res.net_worth ?? 0)],
    ["Status", res.status ?? "—"],
    ["Cash flow", fmtV(res.cashflow ?? 0) + "/mo"],
    ["Runway", (res.runway_months ?? 0).toFixed(1) + " months"],
    ["Assets total", fmtV(res.assets_total ?? 0)],
    ["Debts total", fmtV(res.debts_total ?? 0)],
    ["Emergency fund", fmtV(inp.emergencyFund ?? 0)],
    [],
    ["Note", inp.note ?? ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

  // Sheet 2: Assets
  const assetsRows = [
    ["Category", "Name", "Value"],
    ...(inp.assets ?? []).map((a: any) => [a.category, a.name, a.value]),
    [],
    ["", "Total", inp.assets?.reduce((s: number, a: any) => s + a.value, 0) ?? 0],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(assetsRows), "Assets");

  // Sheet 3: Debts
  const debtRows = [
    ["Type", "Name", "Balance", "Interest Rate", "Classification"],
    ...(inp.debts ?? []).map((d: any) => [
      d.type, d.name, d.balance, `${d.interest}%`,
      d.type === "Mortgage" || d.interest < 4 ? "Good debt" : "Bad debt",
    ]),
    [],
    ["", "Total", inp.debts?.reduce((s: number, d: any) => s + d.balance, 0) ?? 0, "", ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(debtRows), "Debts");

  // Sheet 4: Cash Flow
  const cfRows = [
    ["Type", "Name", "Amount", "Essential"],
    ...(inp.income ?? []).map((i: any) => ["Income", i.name, i.value, ""]),
    ...(inp.expenses ?? []).map((e: any) => ["Expense", e.name, -e.value, e.essential ? "Yes" : "No"]),
    [],
    ["", "Total income", inp.income?.reduce((s: number, i: any) => s + i.value, 0) ?? 0, ""],
    ["", "Total expenses", inp.expenses?.reduce((s: number, e: any) => s + e.value, 0) ?? 0, ""],
    ["", "Net cash flow", (inp.income?.reduce((s: number, i: any) => s + i.value, 0) ?? 0) - (inp.expenses?.reduce((s: number, e: any) => s + e.value, 0) ?? 0), ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cfRows), "Cash Flow");

  XLSX.writeFile(wb, `networth-${month}.xlsx`);
}

// ── History row component ─────────────────────────────
function HistoryRow({ snap, prev, currency, onDelete }: { snap: any; prev: any; currency: string; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inp = snap.payload?.inputs ?? {};
  const res = snap.payload?.result ?? {};
  const nw = res.net_worth ?? 0;
  const prevNW = prev?.payload?.result?.net_worth;
  const delta = prevNW != null ? nw - prevNW : null;
  const assetsTotal = inp.assets?.reduce((s: number, a: any) => s + a.value, 0) ?? 0;
  const debtsTotal = inp.debts?.reduce((s: number, d: any) => s + d.balance, 0) ?? 0;
  const incomeTotal = inp.income?.reduce((s: number, i: any) => s + i.value, 0) ?? 0;
  const expenseTotal = inp.expenses?.reduce((s: number, e: any) => s + e.value, 0) ?? 0;
  const cashflow = incomeTotal - expenseTotal;
  const runway = res.runway_months ?? 0;
  const status = res.status ?? "—";

  const statusColor = status === "Stable" ? C.teal : status === "High Stress" ? C.coral : C.mustard;
  const statusTextColor = status === "Vulnerable" ? C.ink : "white";

  const sectionLabel = (txt: string) => (
    <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.5, letterSpacing: "0.06em", margin: "12px 0 6px", textTransform: "uppercase" as const }}>{txt}</div>
  );

  const lineItem = (name: string, value: number, sub?: string, valueColor?: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 10, padding: "7px 12px", marginBottom: 4, fontSize: 12 }}>
      <div>
        <div style={{ fontWeight: 700 }}>{name}</div>
        {sub && <div style={{ fontSize: 10, opacity: 0.5, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ fontWeight: 800, fontSize: 13, color: valueColor ?? C.ink }}>{fmt(value, currency)}</div>
    </div>
  );

  const sectionTotal = (label: string, value: number, color?: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 12px", fontSize: 12, fontWeight: 800, borderTop: `2px dashed rgba(27,27,27,0.15)`, marginTop: 2, marginBottom: 4 }}>
      <span>{label}</span><span style={{ color: color ?? C.ink }}>{fmt(value, currency)}</span>
    </div>
  );

  return (
    <div style={{ background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 14, marginBottom: 8, overflow: "hidden", boxShadow: `2px 2px 0 ${C.ink}`, fontFamily: "'IBM Plex Mono', monospace" }}>

      {/* Row header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px auto", alignItems: "center", gap: 8, padding: "12px 14px", cursor: "pointer" }}
        onMouseEnter={e => (e.currentTarget.style.background = "#F0E8CE")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
        <div onClick={() => setOpen(!open)}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{snap.month}</div>
          <div style={{ marginTop: 3 }}>
            <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, border: `2px solid ${C.ink}`, background: statusColor, color: statusTextColor }}>{status}</span>
          </div>
        </div>
        <div onClick={() => setOpen(!open)} style={{ fontWeight: 800, fontSize: 16 }}>{fmtShort(nw, currency)}</div>
        <div onClick={() => setOpen(!open)} style={{ fontWeight: 800, fontSize: 13, color: delta == null ? "#888" : delta >= 0 ? C.teal : C.coral }}>
          {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${fmtShort(delta, currency)}`}
        </div>
        <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => setOpen(!open)} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 700, padding: "5px 10px", border: `2px solid ${C.ink}`, borderRadius: 8, background: C.cream, cursor: "pointer", whiteSpace: "nowrap" }}>
            {open ? "Close ▴" : "Details ▾"}
          </button>
          {confirmDelete ? (
            <button onClick={() => onDelete(snap.id)} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 700, padding: "5px 10px", border: `2px solid ${C.coral}`, borderRadius: 8, background: C.coral, color: "white", cursor: "pointer", whiteSpace: "nowrap" }}>
              Sure?
            </button>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 700, padding: "5px 10px", border: `2px solid rgba(27,27,27,0.3)`, borderRadius: 8, background: "transparent", color: "rgba(27,27,27,0.4)", cursor: "pointer", whiteSpace: "nowrap" }}>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Expandable detail */}
      {open && (
        <div style={{ background: C.paper, borderTop: `2px dashed rgba(27,27,27,0.15)`, padding: 14 }}>

          {/* Summary metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 4 }}>
            {[
              { label: "Net worth", value: fmt(nw, currency), color: C.ink },
              { label: "Cash flow", value: `${cashflow >= 0 ? "+" : ""}${fmt(cashflow, currency)}/mo`, color: cashflow >= 0 ? C.teal : C.coral },
              { label: "Runway", value: `${runway.toFixed(1)} mo`, color: C.ink },
            ].map(m => (
              <div key={m.label} style={{ background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Assets */}
          {sectionLabel("Assets")}
          {(inp.assets ?? []).map((a: any, i: number) => lineItem(a.name, a.value, a.category))}
          {sectionTotal("Total assets", assetsTotal)}

          {/* Debts */}
          {sectionLabel("Debts")}
          {(inp.debts ?? []).map((d: any, i: number) => {
            const good = d.type === "Mortgage" || d.interest < 4;
            return lineItem(
              d.name, d.balance,
              `${d.type} · ${d.interest}% · ${good ? "Good debt" : "Bad debt"}`,
              C.coral
            );
          })}
          {sectionTotal("Total debts", debtsTotal, C.coral)}

          {/* Income */}
          {sectionLabel("Monthly income")}
          {(inp.income ?? []).map((i: any) => lineItem(i.name, i.value, undefined, C.teal))}
          {sectionTotal("Total income", incomeTotal, C.teal)}

          {/* Expenses */}
          {sectionLabel("Monthly expenses")}
          {(inp.expenses ?? []).map((e: any) => lineItem(e.name, e.value, e.essential ? "Essential" : "Discretionary", C.coral))}
          {sectionTotal("Total expenses", expenseTotal, C.coral)}

          {/* Emergency fund */}
          {sectionLabel("Emergency fund")}
          {lineItem("Liquid cash reserve", inp.emergencyFund ?? 0)}

          {/* Note */}
          {inp.note && (
            <div style={{ background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 10, padding: "8px 12px", fontSize: 11, fontStyle: "italic", opacity: 0.65, marginTop: 8 }}>
              "{inp.note}"
            </div>
          )}

          {/* Export buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: `2px dashed rgba(27,27,27,0.15)` }}>
            <button onClick={() => exportPDF(snap, currency)} style={{
              fontFamily: "'IBM Plex Mono',monospace", flex: 1, fontSize: 12, fontWeight: 700,
              padding: "9px 12px", border: `2px solid ${C.ink}`, borderRadius: 10,
              background: C.ink, color: "white", cursor: "pointer", boxShadow: `2px 2px 0 ${C.teal}`,
            }}>Export PDF</button>
            <button onClick={() => exportExcel(snap, currency)} style={{
              fontFamily: "'IBM Plex Mono',monospace", flex: 1, fontSize: 12, fontWeight: 700,
              padding: "9px 12px", border: `2px solid ${C.ink}`, borderRadius: 10,
              background: C.cream, color: C.ink, cursor: "pointer", boxShadow: `2px 2px 0 ${C.ink}`,
            }}>Export Excel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── History chart component ───────────────────────────
function HistoryChart({ snapshots, currency }: { snapshots: any[]; currency: string }) {
  const [open, setOpen] = useState(false);
  const [built, setBuilt] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!open || built || !canvasRef.current || snapshots.length < 2) return;
    setBuilt(true);
    loadChartJS().then(() => {
      const Chart = (window as any).Chart;
      const tip = tipRef.current;
      const labels = snapshots.map(s => s.month);
      const nwData = snapshots.map(s => s.payload?.result?.net_worth ?? 0);
      const assetData = snapshots.map(s => s.payload?.inputs?.assets?.reduce((sum: number, a: any) => sum + a.value, 0) ?? 0);
      const debtData = snapshots.map(s => s.payload?.inputs?.debts?.reduce((sum: number, d: any) => sum + d.balance, 0) ?? 0);

      const crosshairPlugin = {
        id: "ch",
        afterDraw(ch: any) {
          if (ch._hx == null) return;
          const { ctx, chartArea: { top, bottom } } = ch;
          ctx.save();
          ctx.beginPath(); ctx.setLineDash([4, 4]);
          ctx.strokeStyle = "rgba(27,27,27,0.2)"; ctx.lineWidth = 1;
          ctx.moveTo(ch._hx, top); ctx.lineTo(ch._hx, bottom); ctx.stroke();
          if (ch._dot) {
            const { px, py } = ch._dot;
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2);
            ctx.fillStyle = C.teal; ctx.fill();
            ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fillStyle = "white"; ctx.fill();
          }
          ctx.restore();
        },
      };

      chartRef.current = new Chart(canvasRef.current, {
        type: "line",
        plugins: [crosshairPlugin],
        data: {
          labels,
          datasets: [
            { label: "Net worth", data: nwData, borderColor: C.ink, borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: C.ink, fill: false, tension: 0.3, order: 1 },
            { label: "Assets", data: assetData, borderColor: "rgba(27,27,27,0.3)", borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3, order: 2 },
            { label: "Debts", data: debtData, borderColor: "rgba(232,89,60,0.5)", borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3, order: 3 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x: { ticks: { color: C.ink, font: { size: 10, family: "'IBM Plex Mono',monospace" } }, grid: { color: "rgba(27,27,27,0.06)" }, border: { color: C.ink } },
            y: { ticks: { color: C.ink, font: { size: 10, family: "'IBM Plex Mono',monospace" }, callback: (v: number) => fmtShort(v, currency) }, grid: { color: "rgba(27,27,27,0.06)" }, border: { color: C.ink } },
          },
          onHover(evt: any, elements: any, ch: any) {
            if (!tip) return;
            if (!elements.length) { ch._hx = null; ch._dot = null; tip.style.display = "none"; ch.draw(); return; }
            const el = elements[0], idx = el.index;
            const s = snapshots[idx];
            const res = s.payload?.result ?? {};
            ch._hx = el.element.x; ch._dot = { px: el.element.x, py: el.element.y }; ch.draw();
            const cw = ch.canvas.offsetWidth;
            (tip.querySelector("#hTipDate") as HTMLElement).textContent = s.month;
            (tip.querySelector("#hTipNW") as HTMLElement).textContent = `Net worth: ${fmtShort(res.net_worth ?? 0, currency)}`;
            (tip.querySelector("#hTipCF") as HTMLElement).textContent = `Cash flow: ${(res.cashflow ?? 0) >= 0 ? "+" : ""}${fmtShort(res.cashflow ?? 0, currency)}/mo`;
            (tip.querySelector("#hTipRW") as HTMLElement).textContent = `Runway: ${(res.runway_months ?? 0).toFixed(1)} months`;
            tip.style.display = "block";
            const tw = 190; let tl = el.element.x + 14; if (tl + tw > cw) tl = el.element.x - tw - 14;
            tip.style.left = tl + "px"; tip.style.top = Math.max(4, el.element.y - 64) + "px";
          },
        },
      });
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [open]);

  return (
    <div>
      <button onClick={() => setOpen(!open)} style={{
        fontFamily: "'IBM Plex Mono',monospace", width: "100%", fontWeight: 700, fontSize: 13,
        padding: "12px 16px", border: `2px solid ${C.ink}`, borderRadius: 14,
        background: C.cream, cursor: "pointer", boxShadow: `2px 2px 0 ${C.ink}`,
        display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4,
      }}>
        <span>Net worth over time</span>
        <span>{open ? "▴ Hide graph" : "▾ Show graph"}</span>
      </button>

      {open && (
        <div style={{ background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 14, padding: 16, boxShadow: `2px 2px 0 ${C.ink}`, marginTop: 8 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 10, fontSize: 11, opacity: 0.55, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 18, height: 2.5, background: C.ink, borderRadius: 2 }}></span>Net worth</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 18, height: 0, borderTop: "2px dashed rgba(27,27,27,0.35)" }}></span>Assets</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 18, height: 0, borderTop: `2px dashed rgba(232,89,60,0.5)` }}></span>Debts</span>
            <span style={{ marginLeft: "auto", fontSize: 10 }}>Hover to explore</span>
          </div>
          <div style={{ position: "relative", width: "100%", height: 240 }}>
            <canvas ref={canvasRef}></canvas>
            <div ref={tipRef} style={{ display: "none", position: "absolute", pointerEvents: "none", background: C.teal, color: "white", border: `2px solid ${C.ink}`, borderRadius: 12, padding: "8px 12px", fontSize: 12, boxShadow: `3px 3px 0 ${C.ink}`, whiteSpace: "nowrap", zIndex: 10 }}>
              <div id="hTipDate" style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}></div>
              <div id="hTipNW" style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}></div>
              <div id="hTipCF" style={{ fontSize: 11, opacity: 0.85, marginBottom: 2 }}></div>
              <div id="hTipRW" style={{ fontSize: 11, opacity: 0.85 }}></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────
type Tab = "overview" | "networth" | "cashflow" | "runway";

export default function NetWorthTracker({ currency, onBack, user, locale = "en" }: { currency: string; onBack: () => void; user: any; locale?: string }) {
  const t = (MESSAGES[locale] || MESSAGES.en).networth;

  const [tab, setTab] = useState<Tab>("overview");
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
  const [history, setHistory] = useState<any[]>([]);

  const [aCat, setACat] = useState(0);
  const [aName, setAName] = useState("");
  const [aValue, setAValue] = useState(0);
  const [dType, setDType] = useState(0);
  const [dName, setDName] = useState("");
  const [dBalance, setDBalance] = useState(0);
  const [dInterest, setDInterest] = useState(0);
  const [iName, setIName] = useState("");
  const [iValue, setIValue] = useState(0);
  const [eName, setEName] = useState("");
  const [eValue, setEValue] = useState(0);
  const [eEssential, setEEssential] = useState(true);

  const assetsTotal = assets.reduce((s, a) => s + a.value, 0);
  const debtsTotal = debts.reduce((s, d) => s + d.balance, 0);
  const netWorth = assetsTotal - debtsTotal;
  const incomeTotal = income.reduce((s, i) => s + i.value, 0);
  const expenseTotal = expenses.reduce((s, e) => s + e.value, 0);
  const cashflow = incomeTotal - expenseTotal;
  const essentialTotal = expenses.filter(e => e.essential).reduce((s, e) => s + e.value, 0);
  const runway = essentialTotal > 0 ? emergencyFund / essentialTotal : 0;

  // ── Load last snapshot + full history ────────────────
  useEffect(() => {
    if (!user) { setRestoring(false); return; }
    // Load latest for restoring inputs
    supabase.from("networth_snapshots").select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(1).single()
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
    // Load all history (up to 24 months)
    supabase.from("networth_snapshots").select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(24)
      .then(({ data }) => {
        if (data) setHistory(data);
      });
  }, [user]);

  // ── Delete snapshot ───────────────────────────────────
  async function deleteSnapshot(id: string) {
    await supabase.from("networth_snapshots").delete().eq("id", id);
    setHistory(prev => prev.filter(s => s.id !== id));
  }

  // ── Calculate ─────────────────────────────────────────
  async function calculate() {
    setLoading(true); setSaveMsg("");
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/networth/calculate`, {
        month: new Date().toISOString().slice(0, 7),
        currency, assets_items: assets, debts_items: debts,
        income_items: income, expense_items: expenses,
        emergency_fund: emergencyFund, note,
      });
      setResult(res.data);
      setTab("overview");
      if (user) {
        const { error, data: inserted } = await supabase.from("networth_snapshots").insert({
          user_id: user.id,
          month: new Date().toLocaleString("default", { month: "short", year: "numeric" }),
          currency,
          net_worth: res.data.net_worth,
          cashflow: res.data.cashflow,
          runway_months: res.data.runway_months,
          status: res.data.status,
          payload: { inputs: { assets, debts, income, expenses, emergencyFund, note }, result: res.data },
        }).select().single();
        setSaveMsg(error ? t.save_error : t.save_success);
        if (!error && inserted) {
          setHistory(prev => [inserted, ...prev]);
        }
      } else {
        setSaveMsg(t.save_signin);
      }
    } catch {
      alert("Could not connect to backend. Make sure uvicorn is running.");
    }
    setLoading(false);
  }

  if (restoring) return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.2rem", fontFamily: "'IBM Plex Mono', monospace" }}>
      <p style={{ opacity: 0.5 }}>{t.restoring}</p>
    </main>
  );

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.2rem", fontFamily: "'IBM Plex Mono', monospace" }}>
      <h1 style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: 4 }}>{t.title}</h1>
      {user && (
        <div style={{ display: "inline-block", fontSize: 12, opacity: 0.6, border: `1px solid ${C.ink}`, borderRadius: 8, padding: "3px 10px", marginBottom: 12 }}>
          {t.signed_in_as} <b>{user.email}</b>
        </div>
      )}
      <p style={{ fontSize: 13, opacity: 0.55, marginBottom: "1.2rem" }}>{t.subtitle}</p>

      {/* ── Overview ── */}
      {tab === "overview" && <>

        {result && (
          <Card title={`${t.status_prefix} ${result.status}`} bg={result.status === "Stable" ? C.teal : C.mustard}>
            <span style={{ color: "white" }}>{result.status_msg}</span>
          </Card>
        )}
        <div onClick={() => setTab("networth")} style={{ background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 18, padding: "14px 16px", boxShadow: `3px 3px 0 ${C.ink}`, marginBottom: 10, cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#F0E8CE")}
          onMouseLeave={e => (e.currentTarget.style.background = C.cream)}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>{t.pillar1_title}</div>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            {t.pillar1_assets} <b>{fmt(assetsTotal, currency)}</b><br />
            {t.pillar1_debts} <b>{fmt(debtsTotal, currency)}</b><br />
            <b style={{ fontSize: 15 }}>{t.nw_net} {fmt(netWorth, currency)}</b>
          </div>
        </div>

        {/* Pillar 2 — clickable */}
        <div onClick={() => setTab("cashflow")} style={{ background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 18, padding: "14px 16px", boxShadow: `3px 3px 0 ${C.ink}`, marginBottom: 10, cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#F0E8CE")}
          onMouseLeave={e => (e.currentTarget.style.background = C.cream)}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>{t.pillar2_title}</div>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            {t.pillar2_income} <b>{fmt(incomeTotal, currency)}</b><br />
            {t.pillar2_expenses} <b>{fmt(expenseTotal, currency)}</b><br />
            <b style={{ fontSize: 15, color: cashflow >= 0 ? C.teal : C.coral }}>
              {t.cashflow_label}: {cashflow >= 0 ? "+" : ""}{fmt(cashflow, currency)}/mo
            </b>
          </div>
        </div>

        {/* Pillar 3 — clickable */}
        <div onClick={() => setTab("runway")} style={{ background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 18, padding: "14px 16px", boxShadow: `3px 3px 0 ${C.ink}`, marginBottom: 10, cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#F0E8CE")}
          onMouseLeave={e => (e.currentTarget.style.background = C.cream)}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>{t.pillar3_title}</div>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            {essentialTotal <= 0
              ? <>{t.pillar3_emergency} <b>{fmt(emergencyFund, currency)}</b><br />{t.pillar3_essential} <b>{t.pillar3_not_set}</b></>
              : <>{t.pillar3_emergency} <b>{fmt(emergencyFund, currency)}</b><br />{t.pillar3_essential} <b>{fmt(essentialTotal, currency)}/mo</b><br /><b style={{ fontSize: 15 }}>{t.pillar3_runway} {runway.toFixed(1)} {t.pillar3_months}</b></>
            }
          </div>
        </div>

        {/* 3 clickable metric cards */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          {[
            { label: t.metric_networth, value: fmt(netWorth, currency), tab: "networth" as Tab },
            { label: t.metric_cashflow, value: fmt(cashflow, currency), tab: "cashflow" as Tab, color: cashflow >= 0 ? C.teal : C.coral },
            { label: t.metric_runway, value: essentialTotal > 0 ? `${runway.toFixed(1)} mo` : t.set_essentials, tab: "runway" as Tab },
          ].map(m => (
            <div key={m.tab} onClick={() => setTab(m.tab)} style={{ background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 16, padding: "12px 14px", boxShadow: `3px 3px 0 ${C.ink}`, textAlign: "center", flex: 1, cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#F0E8CE")}
              onMouseLeave={e => (e.currentTarget.style.background = C.cream)}>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontWeight: 800, fontSize: 15, color: (m as any).color ?? C.ink }}>{m.value}</div>
            </div>
          ))}
        </div>
        {saveMsg && (
          <div style={{ fontSize: 13, marginBottom: 12, padding: "8px 14px", background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 12, boxShadow: `2px 2px 0 ${C.ink}` }}>
            {saveMsg}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <Btn onClick={onBack}>{t.back_home}</Btn>
          <Btn primary onClick={calculate} disabled={loading}>{loading ? t.calculating : t.calculate}</Btn>
        </div>

        {/* ── History section ── */}
        {history.length > 0 && (
          <div style={{ marginTop: 28, borderTop: `2px dashed rgba(27,27,27,0.15)`, paddingTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Net worth history</div>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>Saved automatically on every calculate</div>
              </div>
              <div style={{ fontSize: 11, opacity: 0.4 }}>{history.length} snapshots</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px auto", gap: 8, padding: "4px 14px", fontSize: 10, opacity: 0.5, fontWeight: 700, marginBottom: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
              <span>DATE</span><span>NET WORTH</span><span>CHANGE</span><span></span>
            </div>
            {history.map((snap, i) => (
              <HistoryRow key={snap.id} snap={snap} prev={history[i + 1] ?? null} currency={currency} onDelete={deleteSnapshot} />
            ))}
            {history.length >= 2 && <HistoryChart snapshots={[...history].reverse()} currency={currency} />}
          </div>
        )}
      </>}

      {/* ── Net Worth edit ── */}
      {tab === "networth" && <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button onClick={() => setTab("overview")} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, padding: "6px 14px", border: `2px solid ${C.ink}`, borderRadius: 10, background: C.cream, cursor: "pointer" }}>← Overview</button>
          <h2 style={{ fontWeight: 800, fontSize: "1.2rem", margin: 0 }}>{t.assets_title} & {t.debts_title}</h2>
        </div>
        <Card title={t.add_asset_card}>
          <select value={aCat} onChange={e => setACat(Number(e.target.value))} style={{ ...inputStyle, cursor: "pointer" }}>
            {t.asset_categories.map((c: string, i: number) => <option key={i} value={i}>{c}</option>)}
          </select>
          <input style={inputStyle} placeholder={t.asset_name_placeholder} value={aName} onChange={e => setAName(e.target.value)} />
          <input type="number" style={inputStyle} placeholder={t.asset_value_placeholder.replace("{currency}", currency)} value={aValue || ""} onChange={e => setAValue(Number(e.target.value))} />
          <Btn primary onClick={() => { if (!aName.trim()) return; setAssets([...assets, { category: t.asset_categories[aCat], name: aName, value: aValue }]); setAName(""); setAValue(0); }}>{t.add_asset_btn}</Btn>
        </Card>
        {assets.length === 0 ? <p style={{ fontSize: 13, opacity: 0.5 }}>{t.no_assets}</p> : assets.map((a, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 14, padding: "10px 14px", boxShadow: `2px 2px 0 ${C.ink}`, marginBottom: 8 }}>
            <div><div style={{ fontSize: 13, opacity: 0.6 }}>{a.category}</div><div style={{ fontWeight: 700 }}>{a.name}</div></div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 800 }}>{fmt(a.value, currency)}</div>
              <button onClick={() => setAssets(assets.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
          </div>
        ))}
        <hr style={{ border: "none", borderTop: `2px dashed rgba(27,27,27,0.12)`, margin: "16px 0" }} />
        <h2 style={{ fontWeight: 800, fontSize: "1.2rem", marginBottom: 10 }}>{t.debts_title}</h2>
        <Card title={t.add_debt_card}>
          <select value={dType} onChange={e => setDType(Number(e.target.value))} style={{ ...inputStyle, cursor: "pointer" }}>
            {t.debt_types.map((c: string, i: number) => <option key={i} value={i}>{c}</option>)}
          </select>
          <input style={inputStyle} placeholder={t.debt_name_placeholder} value={dName} onChange={e => setDName(e.target.value)} />
          <input type="number" style={inputStyle} placeholder={t.debt_balance_placeholder.replace("{currency}", currency)} value={dBalance || ""} onChange={e => setDBalance(Number(e.target.value))} />
          <input type="number" style={inputStyle} placeholder={t.debt_interest_placeholder} value={dInterest || ""} onChange={e => setDInterest(Number(e.target.value))} />
          <Btn primary onClick={() => { if (!dName.trim()) return; setDebts([...debts, { type: t.debt_types[dType], name: dName, balance: dBalance, interest: dInterest }]); setDName(""); setDBalance(0); setDInterest(0); }}>{t.add_debt_btn}</Btn>
        </Card>
        {debts.length === 0 ? <p style={{ fontSize: 13, opacity: 0.5 }}>{t.no_debts}</p> : debts.map((d, i) => {
          const good = d.type === "Mortgage" || d.type === t.debt_types[0] || d.interest < 4;
          return (
            <div key={i} style={{ background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 16, padding: "10px 12px", boxShadow: `2px 2px 0 ${C.ink}`, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontWeight: 800 }}>{d.name}</div><div style={{ fontSize: 13 }}>{d.type} · {d.interest}%</div></div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800 }}>{fmt(d.balance, currency)}</div>
                  <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, background: good ? C.teal : C.mustard, color: "white", fontSize: 12, fontWeight: 700 }}>{good ? t.debt_good : t.debt_bad}</span>
                  <button onClick={() => setDebts(debts.filter((_, j) => j !== i))} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
              </div>
            </div>
          );
        })}
        <hr style={{ border: "none", borderTop: `2px dashed rgba(27,27,27,0.12)`, margin: "16px 0" }} />
        <p style={{ fontSize: 14 }}><b>{t.nw_assets}</b> {fmt(assetsTotal, currency)} &nbsp;<b>{t.nw_debts}</b> {fmt(debtsTotal, currency)} &nbsp;<b>{t.nw_net}</b> {fmt(netWorth, currency)}</p>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <Btn onClick={() => setTab("overview")}>← Overview</Btn>
        </div>
      </>}

      {/* ── Cash Flow edit ── */}
      {tab === "cashflow" && <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button onClick={() => setTab("overview")} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, padding: "6px 14px", border: `2px solid ${C.ink}`, borderRadius: 10, background: C.cream, cursor: "pointer" }}>← Overview</button>
          <h2 style={{ fontWeight: 800, fontSize: "1.2rem", margin: 0 }}>{t.cashflow_title}</h2>
        </div>
        <p style={{ fontSize: 13, opacity: 0.55, marginBottom: 10 }}>{t.cashflow_subtitle}</p>
        <Card title={t.add_income_card}>
          <input style={inputStyle} placeholder={t.income_name_placeholder} value={iName} onChange={e => setIName(e.target.value)} />
          <input type="number" style={inputStyle} placeholder={t.income_amount_placeholder.replace("{currency}", currency)} value={iValue || ""} onChange={e => setIValue(Number(e.target.value))} />
          <Btn primary onClick={() => { if (!iName.trim()) return; setIncome([...income, { name: iName, value: iValue }]); setIName(""); setIValue(0); }}>{t.add_income_btn}</Btn>
        </Card>
        {income.length === 0 ? <p style={{ fontSize: 13, opacity: 0.5 }}>{t.no_income}</p> : income.map((inc, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 14, padding: "10px 14px", boxShadow: `2px 2px 0 ${C.ink}`, marginBottom: 8 }}>
            <span style={{ fontWeight: 700 }}>{inc.name}</span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontWeight: 800 }}>{fmt(inc.value, currency)}</span>
              <button onClick={() => setIncome(income.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
          </div>
        ))}
        <hr style={{ border: "none", borderTop: `2px dashed rgba(27,27,27,0.12)`, margin: "16px 0" }} />
        <Card title={t.add_expense_card}>
          <input style={inputStyle} placeholder={t.expense_name_placeholder} value={eName} onChange={e => setEName(e.target.value)} />
          <input type="number" style={inputStyle} placeholder={t.expense_amount_placeholder.replace("{currency}", currency)} value={eValue || ""} onChange={e => setEValue(Number(e.target.value))} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={eEssential} onChange={e => setEEssential(e.target.checked)} />
            {t.essential_label}
          </label>
          <Btn primary onClick={() => { if (!eName.trim()) return; setExpenses([...expenses, { name: eName, value: eValue, essential: eEssential }]); setEName(""); setEValue(0); setEEssential(true); }}>{t.add_expense_btn}</Btn>
        </Card>
        {expenses.length === 0 ? <p style={{ fontSize: 13, opacity: 0.5 }}>{t.no_expenses}</p> : expenses.map((exp, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 14, padding: "10px 14px", boxShadow: `2px 2px 0 ${C.ink}`, marginBottom: 8 }}>
            <div>
              <span style={{ fontWeight: 700 }}>{exp.name}</span>
              <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.6 }}>{exp.essential ? t.essential_tag : t.discretionary_tag}</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontWeight: 800 }}>{fmt(exp.value, currency)}</span>
              <button onClick={() => setExpenses(expenses.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
          </div>
        ))}
        <hr style={{ border: "none", borderTop: `2px dashed rgba(27,27,27,0.12)`, margin: "16px 0" }} />
        <div style={{ display: "flex", gap: 10 }}>
          <Metric label={t.income_label} value={fmt(incomeTotal, currency)} />
          <Metric label={t.expenses_label} value={fmt(expenseTotal, currency)} />
          <Metric label={t.cashflow_label} value={fmt(cashflow, currency)} />
        </div>
        <p style={{ fontSize: 13, opacity: 0.55, marginTop: 8 }}>{t.essential_used.replace("{amount}", fmt(essentialTotal, currency))}</p>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <Btn onClick={() => setTab("overview")}>← Overview</Btn>
        </div>
      </>}

      {/* ── Runway edit ── */}
      {tab === "runway" && <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button onClick={() => setTab("overview")} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, padding: "6px 14px", border: `2px solid ${C.ink}`, borderRadius: 10, background: C.cream, cursor: "pointer" }}>← Overview</button>
          <h2 style={{ fontWeight: 800, fontSize: "1.2rem", margin: 0 }}>{t.runway_title}</h2>
        </div>
        <p style={{ fontSize: 13, opacity: 0.55, marginBottom: 10 }}>{t.runway_subtitle}</p>
        <Card title={t.emergency_card}>
          <input type="number" style={inputStyle} placeholder={t.emergency_placeholder.replace("{currency}", currency)} value={emergencyFund || ""} onChange={e => setEmergencyFund(Number(e.target.value))} />
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
            <div key={m} style={{ flex: 1, background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 14, padding: "12px", boxShadow: `2px 2px 0 ${C.ink}`, textAlign: "center" }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{m} {t.runway_months_suffix}</div>
              <div style={{ fontSize: 20 }}>{runway >= m ? "✅" : "⏳"}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <Btn onClick={() => setTab("overview")}>← Overview</Btn>
        </div>
      </>}

    </main>
  );
}
