"use client";
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────
interface Scenario {
  id: number;
  name: string;
  pv: number;
  pmt: number;
  r: number;
  target: number;
  color: string;
}

// ── Constants ─────────────────────────────────────────
const RATE_MAP: Record<string, number> = {
  "High (stocks 10%)": 0.10,
  "Medium (bonds 6%)": 0.06,
  "Low (savings 3%)": 0.03,
};
const RATE_KEYS = ["High (stocks 10%)", "Medium (bonds 6%)", "Low (savings 3%)"] as const;
const RATE_LABEL_KEYS: Record<string, string> = {
  "High (stocks 10%)": "rate_high",
  "Medium (bonds 6%)": "rate_medium",
  "Low (savings 3%)": "rate_low",
};
const SCENARIO_COLORS = ["#1F8A86", "#E0B12E", "#8B5CF6", "#E8593C", "#2563EB"];
const C = { cream: "#FAF2DE", paper: "#FFF9EA", teal: "#1F8A86", mustard: "#E0B12E", ink: "#1B1B1B" };
const MESSAGES: Record<string, any> = {
  en: require("@/messages/en.json"),
  id: require("@/messages/id.json"),
  zh: require("@/messages/zh.json"),
};

// ── Finance math ──────────────────────────────────────
function calcFV(yr: number, pv: number, pmt: number, r: number): number {
  if (yr === 0) return pv;
  const rm = Math.pow(1 + r, 1 / 12) - 1;
  const n = yr * 12;
  return pv * Math.pow(1 + rm, n) + pmt * ((Math.pow(1 + rm, n) - 1) / rm);
}

// ── Formatting ────────────────────────────────────────
function fmt(value: number, currency: string): string {
  const sym: Record<string, string> = { EUR: "€", IDR: "Rp", CNY: "¥" };
  const s = sym[currency] ?? "";
  if (currency === "IDR") return `${s}${value.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
  return `${s}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtShort(v: number, currency: string): string {
  const sym: Record<string, string> = { EUR: "€", IDR: "Rp", CNY: "¥" };
  const s = sym[currency] ?? "";
  if (v >= 1e9) return `${s}${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${s}${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${s}${Math.round(v / 1e3)}K`;
  return `${s}${Math.round(v)}`;
}
function fmtTick(v: number, currency: string): string {
  const sym: Record<string, string> = { EUR: "€", IDR: "Rp", CNY: "¥" };
  const s = sym[currency] ?? "";
  if (v === 0) return "0";
  if (v >= 1e9) return `${s}${v / 1e9}B`;
  if (v >= 1e6) { const m = v / 1e6; return `${s}${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)}M`; }
  if (v >= 1e3) { const k = v / 1e3; return `${s}${k.toFixed(0)}K`; }
  return `${s}${v}`;
}
function niceRound(v: number): number {
  if (v <= 0) return 0;
  const exp = Math.floor(Math.log10(v));
  const mag = Math.pow(10, exp);
  const steps = [1, 2, 2.5, 5, 10];
  let best = steps[0] * mag;
  for (const s of steps) { const c = s * mag; if (Math.abs(c - v) < Math.abs(best - v)) best = c; }
  return best;
}

// ── X scale: 0-20 = 58%, 20-60 = 42% ─────────────────
function xToV(x: number): number { return x <= 20 ? (x / 20) * 58 : 58 + ((x - 20) / 40) * 42; }
function vToX(v: number): number { return v <= 58 ? (v / 58) * 20 : 20 + ((v - 58) / 42) * 40; }
const X_TICK_LABELS = [0, 5, 10, 15, 20, 30, 40, 50, 60];

// ── Y scale builders ──────────────────────────────────
// 3-segment piecewise: PV→5%, fv20→35%, fv60→100%
function buildYScale(pv: number, fv20: number, fv60: number) {
  return {
    toV(y: number): number {
      if (y <= 0) return 0;
      if (y <= pv) return (y / pv) * 5;
      if (y <= fv20) return 5 + ((y - pv) / (fv20 - pv)) * 30;
      if (y <= fv60) return 35 + ((y - fv20) / (fv60 - fv20)) * 65;
      return 100;
    },
    fromV(v: number): number {
      if (v <= 0) return 0;
      if (v <= 5) return (v / 5) * pv;
      if (v <= 35) return pv + ((v - 5) / 30) * (fv20 - pv);
      return fv20 + ((v - 35) / 65) * (fv60 - fv20);
    },
  };
}
function generateYTicks(pv: number, fv20: number, fv60: number, scale: ReturnType<typeof buildYScale>): number[] {
  const vps = [0, 5, 13, 21, 28, 35, 52, 68, 84, 100];
  return [...new Set(
    vps.map((v, i) => {
      if (i === 0) return 0;
      if (i === 1) return niceRound(pv);
      if (i === 5) return niceRound(fv20);
      if (i === 9) return niceRound(fv60);
      return niceRound(scale.fromV(v));
    })
  )].sort((a, b) => a - b);
}
// Global Y scale across all scenarios
function buildGlobalYScale(scens: Scenario[]) {
  if (!scens.length) return null;
  const allFV20 = scens.map(s => calcFV(20, s.pv, s.pmt, s.r));
  const allFV60 = scens.map(s => calcFV(60, s.pv, s.pmt, s.r));
  const pvAnchor = Math.min(...scens.map(s => s.pv));
  const sorted20 = [...allFV20].sort((a, b) => a - b);
  const fv20Anchor = sorted20[Math.floor(sorted20.length / 2)];
  const fv60Max = Math.max(...allFV60);
  const scale = buildYScale(pvAnchor, fv20Anchor, fv60Max);
  const yTicks = generateYTicks(pvAnchor, fv20Anchor, fv60Max, scale);
  return { scale, yTicks };
}

// ── Chart.js singleton loader ─────────────────────────
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

// ── Shared chart helpers ──────────────────────────────
function makeCrosshairPlugin() {
  return {
    id: "crosshair",
    afterDraw(ch: any) {
      if (ch._hoverPX == null) return;
      const { ctx, chartArea: { top, bottom } } = ch;
      ctx.save();
      ctx.beginPath(); ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(27,27,27,0.2)"; ctx.lineWidth = 1;
      ctx.moveTo(ch._hoverPX, top); ctx.lineTo(ch._hoverPX, bottom); ctx.stroke();
      if (ch._dot) {
        const { px, py, col } = ch._dot;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.strokeStyle = "#1B1B1B"; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = "white"; ctx.fill();
      }
      ctx.restore();
    },
  };
}
function drawHorizonMarkers(
  chartInstance: any,
  horizons: Array<[number, string, string, boolean]>
) {
  setTimeout(() => {
    if (!chartInstance) return;
    const ctx = chartInstance.ctx;
    const { top, bottom } = chartInstance.chartArea;
    const xS = chartInstance.scales.x;
    horizons.forEach(([yr, col, label, dashed]) => {
      if (yr > 60) return;
      const px = xS.getPixelForValue(xToV(yr));
      ctx.save();
      ctx.beginPath();
      if (dashed) ctx.setLineDash([4, 4]);
      ctx.strokeStyle = col; ctx.lineWidth = dashed ? 1.5 : 2;
      ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "bold 10px 'IBM Plex Mono',monospace";
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(px - tw / 2, top - 2, tw, 18, 4); ctx.fill();
      ctx.fillStyle = "white"; ctx.textAlign = "center";
      ctx.fillText(label, px, top + 12);
      ctx.restore();
    });
  }, 150);
}
function makeChartOptions(
  yTicks: number[],
  scale: ReturnType<typeof buildYScale>,
  currency: string,
  onHoverFn: (evt: any, elements: any, ch: any) => void
) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: {
        type: "linear", min: 0, max: 100,
        afterBuildTicks(a: any) { a.ticks = X_TICK_LABELS.map(t => ({ value: xToV(t) })); },
        ticks: {
          color: C.ink, font: { size: 10, family: "'IBM Plex Mono',monospace" },
          callback(v: number) { const t = X_TICK_LABELS.find(t => Math.abs(xToV(t) - v) < 0.5); return t != null ? t : null; },
          autoSkip: false, maxTicksLimit: 20,
        },
        grid: { color: "rgba(27,27,27,0.06)" }, border: { color: C.ink },
        title: { display: true, text: "Years", color: C.ink, font: { size: 11 } },
      },
      y: {
        type: "linear", min: 0, max: 100,
        afterBuildTicks(a: any) { a.ticks = yTicks.map(t => ({ value: scale.toV(t) })); },
        ticks: {
          color: C.ink, font: { size: 10, family: "'IBM Plex Mono',monospace" },
          callback(v: number) {
            const t = yTicks.find(t => Math.abs(scale.toV(t) - v) < 0.6);
            return t != null ? fmtTick(t, currency) : null;
          },
          autoSkip: false, maxTicksLimit: 20,
        },
        grid: { color: "rgba(27,27,27,0.06)" }, border: { color: C.ink },
      },
    },
    onHover: onHoverFn,
  };
}

// ── Sub-components ────────────────────────────────────
const inputStyle = {
  width: "100%", border: `2px solid ${C.ink}`,
  borderRadius: 14, padding: "10px 14px",
  fontSize: 14, background: "white", outline: "none",
  boxSizing: "border-box" as const,
};
function Card({ title, children, bg }: { title: string; children: React.ReactNode; bg?: string }) {
  return (
    <div style={{ background: bg || C.cream, border: `2px solid ${C.ink}`, borderRadius: 18, padding: "14px 16px", boxShadow: `3px 3px 0 ${C.ink}`, marginBottom: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.4 }}>{children}</div>
    </div>
  );
}
function Btn({ onClick, primary, disabled, children }: { onClick?: () => void; primary?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: primary ? C.teal : C.cream, color: primary ? "white" : C.ink,
      border: `2px solid ${C.ink}`, borderRadius: 14, boxShadow: `2px 2px 0 ${C.ink}`,
      padding: "10px 20px", fontWeight: 700, fontSize: 14,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
      fontFamily: "'IBM Plex Mono', monospace",
    }}>{children}</button>
  );
}
function Metric({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{
      background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 16,
      padding: "12px 14px", boxShadow: `3px 3px 0 ${C.ink}`,
      cursor: onClick ? "pointer" : "default", textAlign: "center", flex: 1,
    }}>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 16 }}>{value}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────
export default function RetirementCalculator({
  currency, onBack, user, locale = "en",
}: {
  currency: string; onBack: () => void; user: any; locale?: string;
}) {
  const t = (MESSAGES[locale] || MESSAGES.en).retirement;

  // ── Wizard state ──────────────────────────────────
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

  // ── Chart refs ────────────────────────────────────
  const mainChartRef = useRef<HTMLCanvasElement>(null);
  const mainChartInstance = useRef<any>(null);
  const mainTipRef = useRef<HTMLDivElement>(null);

  // ── Scenario state ────────────────────────────────
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editIdx, setEditIdx] = useState(-1);
  const [scenName, setScenName] = useState("");
  const [scenPV, setScenPV] = useState("");
  const [scenPMT, setScenPMT] = useState("");
  const [scenR, setScenR] = useState(0.10);
  const [scenTarget, setScenTarget] = useState(15);
  const [deleteConfirm, setDeleteConfirm] = useState(-1);

  // ── Scenario chart refs ───────────────────────────
  const scenChartRef = useRef<HTMLCanvasElement>(null);
  const scenChartInstance = useRef<any>(null);
  const scenTipRef = useRef<HTMLDivElement>(null);

  // ── Load last snapshot ────────────────────────────
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
           if (data.payload.scenarios?.length) {
            setScenarios(data.payload.scenarios);
           }
          if (data.payload.result) setStep(5);
        }
        setRestoring(false);
      });
  }, [user]);

  // ── Calculate ─────────────────────────────────────
  async function calculate() {
    setLoading(true); setSaveMsg("");
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/retirement/calculate`, {
        currency,
        current_net_worth: amount,
        monthly_contribution: wantMonthly ? monthly : 0,
        years,
        annual_return: RATE_MAP[returnChoice],
      });
      setResult(res.data);
      setStep(5);
      // Seed first scenario from main calculation
      setScenarios([{
        id: Date.now(),
        name: name || "Base plan",
        pv: amount,
        pmt: wantMonthly ? monthly : 0,
        r: RATE_MAP[returnChoice],
        target: years,
        color: SCENARIO_COLORS[0],
      }]);
      setActiveIdx(0);
      if (user) {
        const { error } = await supabase.from("retirement_snapshots").insert({
          user_id: user.id, currency, amount,
          monthly_contribution: wantMonthly ? monthly : 0,
          return_choice: returnChoice, target_years: years,
          projected_pot: res.data.fv, monthly_draw: res.data.monthly_drawdown,
          tier_name: res.data.tier_name,
          payload: {
            inputs: { name, amount, monthly, wantMonthly, returnChoice, years },
            result: res.data,
            scenarios: [{
              id: Date.now(),
              name: name || "Base plan",
              pv: amount,
              pmt: wantMonthly ? monthly : 0,
              r: RATE_MAP[returnChoice],
              target: years,
              color: SCENARIO_COLORS[0],
            }],
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

  // ── Main chart ────────────────────────────────────
  useEffect(() => {
    if (step !== 5 || !result || !mainChartRef.current) return;
    const canvas = mainChartRef.current;
    const tipEl = mainTipRef.current;

    loadChartJS().then(() => {
      const Chart = (window as any).Chart;
      if (mainChartInstance.current) { mainChartInstance.current.destroy(); mainChartInstance.current = null; }

      const pv = amount;
      const pmt = wantMonthly ? monthly : 0;
      const r = RATE_MAP[returnChoice];
      const fv20 = calcFV(20, pv, pmt, r);
      const fv60 = calcFV(60, pv, pmt, r);
      const scale = buildYScale(pv, fv20, fv60);
      const yTicks = generateYTicks(pv, fv20, fv60, scale);
      const yearArr = Array.from({ length: 61 }, (_, i) => i);
      const fvValues = yearArr.map(yr => calcFV(yr, pv, pmt, r));
      const contribValues = yearArr.map(yr => pv + pmt * 12 * yr);

      const onHover = (evt: any, _: any, ch: any) => {
        if (!tipEl) return;
        const rect = ch.canvas.getBoundingClientRect();
        const { chartArea: { left, right, top, bottom }, scales: { x, y } } = ch;
        if (!evt.native) { ch._hoverPX = null; ch._dot = null; tipEl.style.display = "none"; ch.draw(); return; }
        const mx = evt.native.clientX - rect.left, my = evt.native.clientY - rect.top;
        if (mx < left || mx > right || my < top || my > bottom) {
          ch._hoverPX = null; ch._dot = null; tipEl.style.display = "none"; ch.draw(); return;
        }
        const realX = Math.max(0, Math.min(60, Math.round(vToX(x.getValueForPixel(mx)))));
        const fv = fvValues[realX];
        const contrib = contribValues[realX];
        const px = x.getPixelForValue(xToV(realX));
        const py = y.getPixelForValue(scale.toV(fv));
        ch._hoverPX = px; ch._dot = { px, py, col: C.teal }; ch.draw();
        const cw = ch.canvas.offsetWidth;
        (tipEl.querySelector("#mTipYear") as HTMLElement).textContent = `Year ${realX}`;
        (tipEl.querySelector("#mTipPot") as HTMLElement).textContent = `${t.results_pot} ${fmtShort(fv, currency)}`;
        (tipEl.querySelector("#mTipGain") as HTMLElement).textContent = `+${fmtShort(fv - contrib, currency)} growth`;
        (tipEl.querySelector("#mTipDraw") as HTMLElement).textContent = `${fmtShort(fv * 0.04 / 12, currency)}/mo draw`;
        tipEl.style.display = "block";
        const tw = 185; let tl = px + 14; if (tl + tw > cw) tl = px - tw - 14;
        tipEl.style.left = tl + "px";
        tipEl.style.top = Math.max(4, py - 60) + "px";
      };

      const opts = makeChartOptions(yTicks, scale, currency, onHover);
      mainChartInstance.current = new Chart(canvas, {
        type: "scatter",
        plugins: [makeCrosshairPlugin()],
        data: {
          datasets: [
            { label: "pot", data: yearArr.map(yr => ({ x: xToV(yr), y: scale.toV(calcFV(yr, pv, pmt, r)) })), borderColor: C.ink, borderWidth: 2.5, pointRadius: 0, showLine: true, fill: false, tension: 0.4, order: 1 },
            { label: "contrib", data: yearArr.map(yr => ({ x: xToV(yr), y: scale.toV(pv + pmt * 12 * yr) })), borderColor: "rgba(27,27,27,0.3)", borderWidth: 1.5, borderDash: [5, 5], pointRadius: 0, showLine: true, fill: false, tension: 0, order: 2 },
          ],
        },
        options: opts,
      });

      drawHorizonMarkers(mainChartInstance.current, [
        [years, C.teal, `T (${years}yr)`, false],
        [years + 5, C.mustard, "T+5", true],
        [years + 10, C.mustard, "T+10", true],
        [years + 20, C.mustard, "T+20", true],
      ]);
    });

    return () => {
      if (mainChartInstance.current) { mainChartInstance.current.destroy(); mainChartInstance.current = null; }
    };
  }, [step, result, amount, monthly, wantMonthly, years, returnChoice, currency]);

  // ── Scenario chart ────────────────────────────────
  useEffect(() => {
    if (step !== 5 || scenarios.length === 0 || !scenChartRef.current) return;
    const canvas = scenChartRef.current;
    const tipEl = scenTipRef.current;

    loadChartJS().then(() => {
      const Chart = (window as any).Chart;
      if (scenChartInstance.current) { scenChartInstance.current.destroy(); scenChartInstance.current = null; }

      const gs = buildGlobalYScale(scenarios);
      if (!gs) return;
      const { scale, yTicks } = gs;
      const yearArr = Array.from({ length: 61 }, (_, i) => i);

      const datasets = scenarios.map((s, i) => {
        const active = i === activeIdx;
        return {
          label: s.name,
          data: yearArr.map(yr => ({ x: xToV(yr), y: scale.toV(calcFV(yr, s.pv, s.pmt, s.r)) })),
          borderColor: active ? s.color : `${s.color}40`,
          borderWidth: active ? 3 : 1.5,
          pointRadius: 0, showLine: true, fill: false, tension: 0.4,
          order: active ? 1 : 2,
        };
      });

      useEffect(() => {
  if (!user || !result || scenarios.length === 0) return;
  // Debounce to avoid hammering Supabase on every change
  const timer = setTimeout(async () => {
    await supabase
      .from("retirement_snapshots")
      .update({
        payload: {
          inputs: { name, amount, monthly, wantMonthly, returnChoice, years },
          result,
          scenarios,
        },
      })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
  }, 1000);
  return () => clearTimeout(timer);
}, [scenarios]);

      const onHover = (evt: any, _: any, ch: any) => {
        if (!tipEl) return;
        const rect = ch.canvas.getBoundingClientRect();
        const { chartArea: { left, right, top, bottom }, scales: { x } } = ch;
        if (!evt.native) { ch._hoverPX = null; ch._dot = null; tipEl.style.display = "none"; ch.draw(); return; }
        const mx = evt.native.clientX - rect.left, my = evt.native.clientY - rect.top;
        if (mx < left || mx > right || my < top || my > bottom) {
          ch._hoverPX = null; ch._dot = null; tipEl.style.display = "none"; ch.draw(); return;
        }
        const realX = Math.max(0, Math.min(60, Math.round(vToX(x.getValueForPixel(mx)))));
        const s = scenarios[activeIdx];
        const fv = calcFV(realX, s.pv, s.pmt, s.r);
        const px = x.getPixelForValue(xToV(realX));
        const meta = ch.getDatasetMeta(activeIdx);
        const pt = meta?.data[realX];
        ch._hoverPX = px; ch._dot = { px, py: pt ? pt.y : 100, col: s.color }; ch.draw();
        const cw = ch.canvas.offsetWidth;
        (tipEl.querySelector("#sTipScen") as HTMLElement).textContent = s.name;
        (tipEl.querySelector("#sTipYear") as HTMLElement).textContent = `Year ${realX}`;
        (tipEl.querySelector("#sTipPot") as HTMLElement).textContent = `Pot: ${fmtShort(fv, currency)}`;
        (tipEl.querySelector("#sTipDraw") as HTMLElement).textContent = `Draw: ${fmtShort(fv * 0.04 / 12, currency)}/mo`;
        tipEl.style.display = "block";
        const tw = 185; let tl = px + 14; if (tl + tw > cw) tl = px - tw - 14;
        tipEl.style.left = tl + "px";
        tipEl.style.top = Math.max(4, (pt ? pt.y : 100) - 60) + "px";
      };

      const opts = makeChartOptions(yTicks, scale, currency, onHover);
      scenChartInstance.current = new Chart(canvas, {
        type: "scatter",
        plugins: [makeCrosshairPlugin()],
        data: { datasets },
        options: opts,
      });

      const s = scenarios[activeIdx];
      if (s) {
        drawHorizonMarkers(scenChartInstance.current, [
          [s.target, s.color, `T`, false],
          [s.target + 5, C.ink, "T+5", true],
          [s.target + 10, C.ink, "T+10", true],
        ]);
      }
    });

    return () => {
      if (scenChartInstance.current) { scenChartInstance.current.destroy(); scenChartInstance.current = null; }
    };
  }, [step, scenarios, activeIdx, currency]);

  // ── Scenario CRUD ─────────────────────────────────
  function openModal(idx: number) {
    setEditIdx(idx);
    if (idx >= 0) {
      const s = scenarios[idx];
      setScenName(s.name); setScenPV(String(s.pv)); setScenPMT(String(s.pmt));
      setScenR(s.r); setScenTarget(s.target);
    } else {
      setScenName(""); setScenPV(""); setScenPMT(""); setScenR(0.10); setScenTarget(15);
    }
    setModalOpen(true);
  }
  function saveScenario() {
    const nm = scenName.trim() || `Scenario ${scenarios.length + 1}`;
    const pv = scenPV === "" ? 50000 : parseFloat(scenPV);
    const pmt = scenPMT === "" ? 0 : parseFloat(scenPMT);
    if (editIdx >= 0) {
      setScenarios(prev => prev.map((s, i) => i === editIdx ? { ...s, name: nm, pv, pmt, r: scenR, target: scenTarget } : s));
    } else {
      const newS: Scenario = { id: Date.now(), name: nm, pv, pmt, r: scenR, target: scenTarget, color: SCENARIO_COLORS[scenarios.length % SCENARIO_COLORS.length] };
      setScenarios(prev => [...prev, newS]);
      setActiveIdx(scenarios.length);
    }
    setModalOpen(false);
  }
  function deleteScenario(i: number) {
    setScenarios(prev => prev.filter((_, j) => j !== i));
    setActiveIdx(prev => (prev >= i && prev > 0) ? prev - 1 : 0);
    setDeleteConfirm(-1);
  }

  // ── Render ────────────────────────────────────────
  if (restoring) return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.2rem", fontFamily: "'IBM Plex Mono', monospace" }}>
      <p style={{ opacity: 0.5 }}>{t.restoring}</p>
    </main>
  );

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.2rem", fontFamily: "'IBM Plex Mono', monospace" }}>

      {/* User badge */}
      {user && (
        <div style={{ display: "inline-block", fontSize: 12, opacity: 0.6, border: `1px solid ${C.ink}`, borderRadius: 8, padding: "3px 10px", marginBottom: 16 }}>
          {t.signed_in_as} <b>{user.email}</b>
        </div>
      )}

      {/* ── Step 1 ── */}
      {step === 1 && <>
        <h1 style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: "1.2rem" }}>{t.title}</h1>
        <Card title={t.step1_title}>
          {t.step1_desc}
          <input style={{ ...inputStyle, marginTop: 10 }} placeholder={t.step1_placeholder} value={name} onChange={e => setName(e.target.value)} />
        </Card>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <Btn onClick={onBack}>{t.back_home}</Btn>
          <Btn primary disabled={!name.trim()} onClick={() => setStep(2)}>{t.continue}</Btn>
        </div>
      </>}

      {/* ── Step 2 ── */}
      {step === 2 && <>
        <h1 style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: "1.2rem" }}>{t.step2_title.replace("{name}", name || "friend")}</h1>
        <Card title={t.step2_card}>
          <p style={{ margin: "0 0 8px" }}>{t.step2_desc}</p>
          <div style={{ marginBottom: 8, fontSize: 13, opacity: 0.6 }}>{t.step2_currency} <b>{currency}</b></div>
          <input type="number" style={inputStyle} min={0} placeholder={t.step2_placeholder.replace("{currency}", currency)} value={amount || ""} onChange={e => setAmount(Number(e.target.value))} />
        </Card>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <Btn onClick={() => setStep(1)}>{t.back}</Btn>
          <Btn primary onClick={() => setStep(3)}>{t.continue}</Btn>
        </div>
      </>}

      {/* ── Step 3 ── */}
      {step === 3 && <>
        <h1 style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: "1.2rem" }}>{t.step3_title}</h1>
        <Card title={t.step3_card}>
          <p style={{ margin: "0 0 12px" }}>{t.step3_desc}</p>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            {[t.step3_no, t.step3_yes].map((opt, i) => (
              <Btn key={opt} primary={wantMonthly === (i === 1)} onClick={() => setWantMonthly(i === 1)}>{opt}</Btn>
            ))}
          </div>
          {wantMonthly && (
            <input type="number" style={inputStyle} min={0} placeholder={t.step3_placeholder.replace("{currency}", currency)} value={monthly || ""} onChange={e => setMonthly(Number(e.target.value))} />
          )}
        </Card>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <Btn onClick={() => setStep(2)}>{t.back}</Btn>
          <Btn primary onClick={() => setStep(4)}>{t.continue}</Btn>
        </div>
      </>}

      {/* ── Step 4 ── */}
      {step === 4 && <>
        <h1 style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: "1.2rem" }}>{t.step4_title}</h1>
        <Card title={t.step4_card}>
          <p style={{ margin: "0 0 10px" }}>{t.step4_desc}</p>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t.step4_return_label}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {RATE_KEYS.map(k => (
                <button key={k} onClick={() => setReturnChoice(k)} style={{
                  background: returnChoice === k ? C.teal : C.cream, color: returnChoice === k ? "white" : C.ink,
                  border: `2px solid ${C.ink}`, borderRadius: 14, boxShadow: `2px 2px 0 ${C.ink}`,
                  padding: "10px 16px", fontWeight: 700, fontSize: 14, textAlign: "left", cursor: "pointer",
                  fontFamily: "'IBM Plex Mono', monospace",
                }}>{t[RATE_LABEL_KEYS[k]]}</button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            {t.step4_years_label} <span style={{ color: C.teal }}>{years}</span>
          </div>
          <input type="range" min={1} max={60} value={years} onChange={e => setYears(Number(e.target.value))} style={{ width: "100%", accentColor: C.teal }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.5 }}>
            <span>{t.step4_min}</span><span>{t.step4_max}</span>
          </div>
        </Card>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <Btn onClick={() => setStep(3)}>{t.back}</Btn>
          <Btn primary onClick={calculate} disabled={loading}>{loading ? t.step4_calculating : t.step4_see_results}</Btn>
        </div>
      </>}

      {/* ── Step 5: Results ── */}
      {step === 5 && result && <>
        <h1 style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: 6 }}>{t.results_title}</h1>
        <p style={{ fontSize: 13, opacity: 0.6, marginBottom: "1.2rem" }}>
          {name} • {currency} • {t[RATE_LABEL_KEYS[returnChoice]]} • {years} {t.results_years}
        </p>

        {saveMsg && (
          <div style={{ fontSize: 13, marginBottom: 12, padding: "8px 14px", background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 12, boxShadow: `2px 2px 0 ${C.ink}` }}>
            {saveMsg}
          </div>
        )}

        {/* Metric cards */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <Metric label={t.results_starting} value={fmt(amount, currency)} onClick={() => setStep(2)} />
          <Metric label={t.results_monthly} value={fmt(wantMonthly ? monthly : 0, currency)} onClick={() => setStep(3)} />
          <Metric label={t.results_target} value={`${years} ${t.results_years}`} onClick={() => setStep(4)} />
        </div>

        <hr style={{ border: "none", borderTop: `2px dashed rgba(27,27,27,0.12)`, margin: "16px 0" }} />

        {/* Result summary */}
        <Card title={t.results_card_title.replace("{years}", String(years))}>
          <p><b>{t.results_pot}</b> {fmt(result.fv, currency)}</p>
          <p><b>{t.results_draw}</b> {fmt(result.annual_drawdown, currency)}{t.results_per_yr} (≈ {fmt(result.monthly_drawdown, currency)}{t.results_per_mo})</p>
          <p style={{ opacity: 0.85 }}>{t.results_inflation} {fmt(result.annual_drawdown_real, currency)}{t.results_per_yr} (≈ {fmt(result.monthly_drawdown_real, currency)}{t.results_per_mo})</p>
          <p style={{ marginTop: 8 }}><b>{t.results_tier}</b> {result.tier_name}</p>
          <p style={{ opacity: 0.9 }}>{result.tier_desc}</p>
        </Card>

        {/* ── Main growth chart ── */}
        <div style={{ background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 18, padding: 16, boxShadow: `3px 3px 0 ${C.ink}`, marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>Compound growth — 0 to 60 years</div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 10, fontSize: 11, opacity: 0.55, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ display: "inline-block", width: 18, height: 2.5, background: C.ink, borderRadius: 2 }}></span>Projected pot
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ display: "inline-block", width: 18, height: 0, borderTop: "2px dashed rgba(27,27,27,0.35)" }}></span>Contributions only
            </span>
            <span style={{ marginLeft: "auto", fontSize: 10 }}>Hover to explore</span>
          </div>

          {/* Horizon cards row */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[[years, C.teal, `T (${years} yrs)`], [years + 5, C.mustard, `T+5 (${years + 5} yrs)`], [years + 10, C.mustard, `T+10 (${years + 10} yrs)`], [years + 20, C.mustard, `T+20 (${years + 20} yrs)`]].map(([yr, col, label]) => (
              <div key={String(label)} style={{ flex: 1, minWidth: 100, background: col === C.teal ? C.teal : C.cream, color: col === C.teal ? "white" : C.ink, border: `2px solid ${C.ink}`, borderRadius: 12, padding: "8px 12px", boxShadow: `2px 2px 0 ${C.ink}` }}>
                <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 2 }}>{String(label)}</div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{fmtShort(calcFV(Number(yr), amount, wantMonthly ? monthly : 0, RATE_MAP[returnChoice]), currency)}</div>
              </div>
            ))}
          </div>

          <div style={{ position: "relative", width: "100%", height: 300 }}>
            <canvas ref={mainChartRef}></canvas>
            <div ref={mainTipRef} style={{ display: "none", position: "absolute", pointerEvents: "none", background: C.teal, color: "white", border: `2px solid ${C.ink}`, borderRadius: 12, padding: "8px 12px", fontSize: 12, boxShadow: `3px 3px 0 ${C.ink}`, whiteSpace: "nowrap", zIndex: 10 }}>
              <div id="mTipYear" style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}></div>
              <div id="mTipPot" style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}></div>
              <div id="mTipGain" style={{ fontSize: 11, opacity: 0.85, marginBottom: 2 }}></div>
              <div id="mTipDraw" style={{ fontSize: 11, opacity: 0.85 }}></div>
            </div>
          </div>
        </div>

        {/* Lifestyle deep-dive */}
        <Card title={t.results_lifestyle}>
          <div style={{ lineHeight: 1.6 }}>
            <ReactMarkdown>{result.lifestyle_md}</ReactMarkdown>
          </div>
        </Card>

        <p style={{ fontSize: 13, opacity: 0.55, margin: "12px 0" }}>{t.results_notes}</p>

        {/* ── Scenario comparison ── */}
        <div style={{ marginTop: 24, borderTop: `2px dashed rgba(27,27,27,0.15)`, paddingTop: 20 }}>

          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Scenario comparison</div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>Optional · what-if planning</div>
            </div>
            {scenarios.length < 5 && (
              <button onClick={() => openModal(-1)} style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 12, padding: "8px 14px", background: C.teal, color: "white", border: `2px solid ${C.ink}`, borderRadius: 12, boxShadow: `2px 2px 0 ${C.ink}`, cursor: "pointer" }}>
                + Add scenario
              </button>
            )}
          </div>

          {/* Pills */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {scenarios.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.4 }}>Add your first scenario to start comparing</div>
            ) : scenarios.map((s, i) => {
              const active = i === activeIdx;
              return (
                <button key={s.id} onClick={() => setActiveIdx(i)} style={{
                  fontFamily: "'IBM Plex Mono',monospace", display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", border: `2px solid ${C.ink}`, borderRadius: 999, cursor: "pointer",
                  fontSize: 12, fontWeight: 700, background: active ? s.color : C.cream,
                  color: active ? "white" : C.ink, boxShadow: active ? `2px 2px 0 ${C.ink}` : "none",
                }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: active ? "white" : s.color, flexShrink: 0 }}></span>
                  {s.name}
                </button>
              );
            })}
          </div>

          {/* Scenario chart */}
          {scenarios.length > 0 && (
            <div style={{ background: C.cream, border: `2px solid ${C.ink}`, borderRadius: 18, padding: 16, boxShadow: `3px 3px 0 ${C.ink}`, marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 10, fontSize: 11, opacity: 0.55, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ display: "inline-block", width: 18, height: 2.5, background: C.ink, borderRadius: 2 }}></span>Active
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ display: "inline-block", width: 18, height: 2, background: "rgba(27,27,27,0.2)", borderRadius: 2 }}></span>Others
                </span>
                <span style={{ marginLeft: "auto", fontSize: 10 }}>Hover to explore</span>
              </div>
              <div style={{ position: "relative", width: "100%", height: 300 }}>
                <canvas ref={scenChartRef}></canvas>
                <div ref={scenTipRef} style={{ display: "none", position: "absolute", pointerEvents: "none", background: C.teal, color: "white", border: `2px solid ${C.ink}`, borderRadius: 12, padding: "8px 12px", fontSize: 12, boxShadow: `3px 3px 0 ${C.ink}`, whiteSpace: "nowrap", zIndex: 10 }}>
                  <div id="sTipScen" style={{ fontSize: 10, opacity: 0.8, marginBottom: 2 }}></div>
                  <div id="sTipYear" style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}></div>
                  <div id="sTipPot" style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}></div>
                  <div id="sTipDraw" style={{ fontSize: 11, opacity: 0.85 }}></div>
                </div>
              </div>
            </div>
          )}

          {/* Scenario table cards */}
          {scenarios.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 80px", gap: 8, padding: "4px 12px", fontSize: 10, opacity: 0.5, fontWeight: 700 }}>
                <span>SCENARIO</span><span>AT TARGET</span><span>MONTHLY DRAW</span><span>SETTINGS</span><span></span>
              </div>
              {scenarios.map((s, i) => {
                const active = i === activeIdx;
                const fvT = calcFV(s.target, s.pv, s.pmt, s.r);
                const draw = fvT * 0.04 / 12;
                return (
                  <div key={s.id} onClick={() => setActiveIdx(i)} style={{
                    display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 80px",
                    gap: 8, alignItems: "center",
                    background: active ? s.color : C.cream, color: active ? "white" : C.ink,
                    border: `2px solid ${C.ink}`, borderRadius: 14, padding: "12px",
                    boxShadow: `${active ? 3 : 2}px ${active ? 3 : 2}px 0 ${C.ink}`, cursor: "pointer",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13 }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: active ? "white" : s.color, flexShrink: 0 }}></span>
                      {s.name}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{fmtShort(fvT, currency)}</div>
                      <div style={{ fontSize: 10, opacity: 0.7 }}>in {s.target} yrs</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{fmtShort(draw, currency)}/mo</div>
                      <div style={{ fontSize: 10, opacity: 0.7 }}>4% rule</div>
                    </div>
                    <div style={{ fontSize: 11, opacity: active ? 0.85 : 0.6, lineHeight: 1.6 }}>
                      Start: {fmtShort(s.pv, currency)}<br />
                      DCA: {fmtShort(s.pmt, currency)}/mo<br />
                      Return: {(s.r * 100).toFixed(0)}%
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => openModal(i)} style={{
                        fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 700, padding: "5px 10px",
                        border: `2px solid ${active ? "white" : C.ink}`, borderRadius: 8,
                        background: active ? "rgba(255,255,255,0.15)" : C.cream,
                        color: active ? "white" : C.ink, cursor: "pointer",
                      }}>Edit</button>
                      {deleteConfirm === i ? (
                        <button onClick={() => deleteScenario(i)} style={{
                          fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 700, padding: "5px 10px",
                          border: `2px solid #E8593C`, borderRadius: 8,
                          background: "#E8593C", color: "white", cursor: "pointer",
                        }}>Sure?</button>
                      ) : (
                        <button onClick={() => setDeleteConfirm(i)} style={{
                          fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 700, padding: "5px 10px",
                          border: `2px solid ${active ? "rgba(255,255,255,0.4)" : C.ink}`, borderRadius: 8,
                          background: "transparent",
                          color: active ? "rgba(255,255,255,0.6)" : "rgba(27,27,27,0.4)", cursor: "pointer",
                        }}>Delete</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <Btn onClick={() => setStep(4)}>{t.results_edit}</Btn>
          <Btn primary onClick={onBack}>{t.back_home}</Btn>
        </div>
      </>}

      {/* ── Scenario modal ── */}
      {modalOpen && (
        <>
          <div onClick={() => setModalOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(27,27,27,0.5)", zIndex: 100 }} />
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 101,
            background: C.paper, borderTop: `2px solid ${C.ink}`,
            borderRadius: "18px 18px 0 0", padding: 20,
            maxWidth: 600, margin: "0 auto", boxShadow: `0 -4px 0 ${C.ink}`,
            fontFamily: "'IBM Plex Mono', monospace",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{editIdx >= 0 ? "Edit scenario" : "New scenario"}</div>
              <button onClick={() => setModalOpen(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", opacity: 0.5 }}>✕</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, opacity: 0.6, display: "block", marginBottom: 4 }}>Scenario name</label>
              <input value={scenName} onChange={e => setScenName(e.target.value)} placeholder="e.g. Aggressive growth" style={{ ...inputStyle }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, opacity: 0.6, display: "block", marginBottom: 4 }}>Starting amount ({currency})</label>
                <input type="number" value={scenPV} onChange={e => setScenPV(e.target.value)} placeholder="50000" style={{ ...inputStyle }} />
              </div>
              <div>
                <label style={{ fontSize: 12, opacity: 0.6, display: "block", marginBottom: 4 }}>Monthly DCA ({currency})</label>
                <input type="number" value={scenPMT} onChange={e => setScenPMT(e.target.value)} placeholder="0" style={{ ...inputStyle }} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, opacity: 0.6, display: "block", marginBottom: 6 }}>Return profile</label>
              <div style={{ display: "flex", gap: 8 }}>
                {[["Low 3%", 0.03], ["Medium 6%", 0.06], ["High 10%", 0.10]].map(([label, val]) => (
                  <button key={String(val)} onClick={() => setScenR(Number(val))} style={{
                    fontFamily: "'IBM Plex Mono',monospace", flex: 1, fontSize: 11, fontWeight: 700,
                    padding: "8px 6px", border: `2px solid ${C.ink}`, borderRadius: 10, cursor: "pointer",
                    background: scenR === val ? C.ink : C.cream, color: scenR === val ? "white" : C.ink,
                  }}>{String(label)}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, opacity: 0.6, display: "block", marginBottom: 4 }}>Target years: <b>{scenTarget}</b></label>
              <input type="range" min={1} max={60} value={scenTarget} onChange={e => setScenTarget(Number(e.target.value))} style={{ width: "100%", accentColor: C.teal }} />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <Btn onClick={() => setModalOpen(false)}>Cancel</Btn>
              <button onClick={saveScenario} style={{
                fontFamily: "'IBM Plex Mono',monospace", flex: 2, fontWeight: 700, fontSize: 13,
                padding: 11, border: `2px solid ${C.ink}`, borderRadius: 12,
                background: C.teal, color: "white", boxShadow: `2px 2px 0 ${C.ink}`, cursor: "pointer",
              }}>Save scenario</button>
            </div>
          </div>
        </>
      )}

    </main>
  );
}
