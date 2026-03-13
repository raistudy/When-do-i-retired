"use client";
import { useState, useEffect } from "react";
import RetirementCalculator from "@/components/RetirementCalculator";
import NetWorthTracker from "@/components/NetWorthTracker";
import AuthPage from "@/components/AuthPage";
import { supabase } from "@/lib/supabase";

const C = {
  cream: "#FAF2DE", paper: "#FFF9EA",
  teal: "#1F8A86", mustard: "#E0B12E", ink: "#1B1B1B",
};

export default function Home() {
  const [page, setPage] = useState<"home" | "retirement" | "networth" | "auth">("home");
const [currency, setCurrency] = useState("EUR");
const [user, setUser] = useState<any>(null);
useEffect(() => {
  supabase.auth.getSession().then(({ data }) => {
    setUser(data.session?.user ?? null);
  });
  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ?? null);
  });
  return () => listener.subscription.unsubscribe();
}, []);

  if (page === "retirement") return <RetirementCalculator currency={currency} user={user} onBack={() => setPage("home")} />;
  if (page === "networth") return <NetWorthTracker currency={currency} user={user} onBack={() => setPage("home")} />;
  if (page === "auth") return <AuthPage onBack={() => setPage("home")} />;

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.2rem" }}>

      {/* Title */}
      <h1 style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: "2rem",
        fontWeight: 900,
        marginBottom: "1.2rem",
        color: "var(--ink)",
      }}>
        When do I Retired
      </h1>

      {/* Welcome card */}
<div style={{
  background: "#FAF2DE",
  border: "2px solid #1B1B1B",
  borderRadius: 18,
  padding: "14px 16px",
  boxShadow: "3px 3px 0 #1B1B1B",
  marginBottom: 10,
}}>
  <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Welcome 👋</div>
  <div style={{ fontSize: 14, lineHeight: 1.4 }}>
    Choose a tool to begin. They are independent for now, but share the same style and currency setting.
  </div>
</div>

{/* Currency selector */}
<div style={{ marginBottom: 10 }}>
  <label style={{ fontSize: 14, display: "block", marginBottom: 6, opacity: 0.7 }}>
    Default currency
  </label>
  <select
    value={currency}
    onChange={e => setCurrency(e.target.value)}
    style={{
      border: "2px solid #1B1B1B",
      borderRadius: 14,
      padding: "8px 14px",
      background: "#FAF2DE",
      fontSize: "0.9rem",
      minWidth: 180,
      cursor: "pointer",
      outline: "none",
    }}
  >
    <option value="EUR">EUR</option>
    <option value="IDR">IDR</option>
    <option value="CNY">CNY</option>
  </select>
</div>

{/* Pick a tool card */}
<div style={{
  background: "#FFF9EA",
  border: "2px solid #1B1B1B",
  borderRadius: 18,
  padding: "14px 16px",
  boxShadow: "3px 3px 0 #1B1B1B",
  marginBottom: 10,
}}>
  <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Pick a tool</div>
  <div style={{ fontSize: 14, lineHeight: 1.4 }}>
    Tap one of the tools below. You can come back here anytime.
  </div>
</div>

      {/* Tool buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: "1.5rem" }}>
        <button
          onClick={() => setPage("networth")}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            background: "var(--teal)",
            color: "white",
            border: "2px solid var(--ink)",
            borderRadius: 14,
            boxShadow: "3px 3px 0 var(--ink)",
            padding: "18px 16px",
            textAlign: "left",
            cursor: "pointer",
            lineHeight: 1.5,
            transition: "box-shadow 0.1s, transform 0.1s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "1px 1px 0 var(--ink)";
            (e.currentTarget as HTMLButtonElement).style.transform = "translate(2px,2px)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "3px 3px 0 var(--ink)";
            (e.currentTarget as HTMLButtonElement).style.transform = "translate(0,0)";
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: 4 }}>Net Worth Tracker</div>
          <div style={{ fontSize: "0.78rem", opacity: 0.85 }}>Assets • Debts • Cash flow • Runway</div>
        </button>

        <button
          onClick={() => setPage("retirement")}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            background: "var(--teal)",
            color: "white",
            border: "2px solid var(--ink)",
            borderRadius: 14,
            boxShadow: "3px 3px 0 var(--ink)",
            padding: "18px 16px",
            textAlign: "left",
            cursor: "pointer",
            lineHeight: 1.5,
            transition: "box-shadow 0.1s, transform 0.1s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "1px 1px 0 var(--ink)";
            (e.currentTarget as HTMLButtonElement).style.transform = "translate(2px,2px)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "3px 3px 0 var(--ink)";
            (e.currentTarget as HTMLButtonElement).style.transform = "translate(0,0)";
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: 4 }}>Retirement Calculator</div>
          <div style={{ fontSize: "0.78rem", opacity: 0.85 }}>Compound growth • Tiers • Insights</div>
        </button>
      </div>

      {/* Auth status */}
<div style={{ marginTop: 32, textAlign: "center" }}>
  {user ? (
    <div style={{ fontSize: 13 }}>
      <span style={{ opacity: 0.6 }}>Signed in as </span>
      <b>{user.email}</b>
      <button onClick={() => supabase.auth.signOut()} style={{
        marginLeft: 12,
        background: "none",
        border: `1px solid ${C.ink}`,
        borderRadius: 8,
        padding: "3px 10px",
        fontSize: 12,
        cursor: "pointer",
        opacity: 0.6,
      }}>Sign out</button>
    </div>
  ) : (
    <button onClick={() => setPage("auth")} style={{
      background: "none",
      border: `2px solid ${C.ink}`,
      borderRadius: 14,
      padding: "8px 20px",
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      boxShadow: `2px 2px 0 ${C.ink}`,
    }}>
      Sign in / Sign up
    </button>
  )}
</div>

<p style={{ marginTop: 16, fontSize: "0.72rem", opacity: 0.3, textAlign: "center" }}>
  Built with Next.js + FastAPI + Supabase
</p>

    </main>
  );
}