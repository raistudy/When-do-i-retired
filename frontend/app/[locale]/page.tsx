"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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

export default function LandingPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "en";
  const t = MESSAGES[locale] || MESSAGES.en;
  const [user, setUser] = useState<any>(null);
  const [currency, setCurrency] = useState("EUR");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  function goToTool(tool: "retirement" | "networth") {
    sessionStorage.setItem("currency", currency);
    router.push(`/${locale}/tools/${tool}`);
  }

  return (
    <main style={{ background: C.paper, minHeight: "100vh", fontFamily: "'IBM Plex Mono', monospace" }}>

      {/* Nav */}
      <nav style={{
        maxWidth: 860, margin: "0 auto", padding: "1.2rem 1.5rem",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>When do I Retired</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>

          {/* Language switcher */}
          <div style={{ display: "flex", gap: 4 }}>
            {[["en", "EN"], ["id", "ID"], ["zh", "中文"]].map(([loc, label]) => (
              <button key={loc} onClick={() => router.push(`/${loc}`)} style={{
                background: locale === loc ? C.ink : "transparent",
                color: locale === loc ? C.paper : C.ink,
                border: `2px solid ${C.ink}`, borderRadius: 8,
                padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>{label}</button>
            ))}
          </div>

          {/* Auth button */}
          {user ? (
            <button onClick={() => supabase.auth.signOut()} style={{
              background: "none", border: `2px solid ${C.ink}`,
              borderRadius: 12, padding: "8px 18px",
              fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>{t.nav.signout}</button>
          ) : (
            <button onClick={() => router.push(`/${locale}/auth`)} style={{
              background: C.teal, color: "white", border: `2px solid ${C.ink}`,
              borderRadius: 12, boxShadow: `2px 2px 0 ${C.ink}`,
              padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>{t.nav.signin}</button>
          )}

        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 860, margin: "0 auto", padding: "3rem 1.5rem 2rem", textAlign: "center" }}>
        <div style={{
          display: "inline-block", fontSize: "0.75rem", fontWeight: 700,
          padding: "4px 14px", borderRadius: 999, border: `2px solid ${C.ink}`,
          background: C.mustard, color: "white", marginBottom: 20, letterSpacing: "0.06em",
        }}>{t.hero.tag}</div>

        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "clamp(2.2rem, 6vw, 3.8rem)",
          fontWeight: 900, lineHeight: 1.1,
          marginBottom: 16, color: C.ink,
        }}>{t.hero.title}</h1>

        <p style={{
          fontSize: "1rem", opacity: 0.6, lineHeight: 1.7,
          maxWidth: 480, margin: "0 auto 32px",
        }}>{t.hero.subtitle}</p>

        {/* Currency selector inline in hero */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 28 }}>
          <label style={{ fontSize: 13, opacity: 0.6 }}>{t.hero.currency_label}</label>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            style={{
              border: `2px solid ${C.ink}`, borderRadius: 14,
              padding: "8px 14px", background: C.cream,
              fontSize: "0.9rem", cursor: "pointer", outline: "none",
              fontFamily: "'IBM Plex Mono', monospace",
            }}>
            <option value="EUR">EUR</option>
            <option value="IDR">IDR</option>
            <option value="CNY">CNY</option>
          </select>
        </div>

        {/* Main CTA scrolls down to tools */}
        <button onClick={() => document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" })} style={{
          background: C.teal, color: "white", border: `2px solid ${C.ink}`,
          borderRadius: 14, boxShadow: `4px 4px 0 ${C.ink}`,
          padding: "14px 28px", fontWeight: 700, fontSize: "1rem", cursor: "pointer",
        }}>{t.hero.cta}</button>

        <p style={{ fontSize: "0.78rem", opacity: 0.4, marginTop: 12 }}>
          {t.hero.sub_cta}
        </p>

        {/* Signed in indicator */}
        {user && (
          <p style={{ fontSize: "0.78rem", opacity: 0.5, marginTop: 8 }}>
            {t.hero.signed_in_as} <b>{user.email}</b>
          </p>
        )}
      </section>

      {/* Divider */}
      <div style={{ maxWidth: 860, margin: "0 auto 2rem", padding: "0 1.5rem" }}>
        <hr style={{ border: "none", borderTop: "2px dashed rgba(27,27,27,0.12)" }} />
      </div>

      {/* Tools section */}
      <section id="tools" style={{ maxWidth: 860, margin: "0 auto", padding: "0 1.5rem 4rem" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "1.8rem", fontWeight: 800, marginBottom: 8,
          }}>{t.preview.title}</h2>
          <p style={{ fontSize: "0.9rem", opacity: 0.6, maxWidth: 520, margin: "0 auto", lineHeight: 1.7 }}>
            {t.preview.subtitle}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Tool 1 — Retirement */}
          <div style={{
            background: C.teal, color: "white", border: `2px solid ${C.ink}`,
            borderRadius: 18, boxShadow: `4px 4px 0 ${C.ink}`, padding: "24px 20px",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{
              display: "inline-block", fontSize: "0.7rem", fontWeight: 700,
              padding: "3px 10px", borderRadius: 999,
              border: "2px solid rgba(255,255,255,0.4)",
              background: "rgba(255,255,255,0.15)", marginBottom: 12, alignSelf: "flex-start",
            }}>{t.preview.tool1_tag}</div>
            <div style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "1.3rem", fontWeight: 700, marginBottom: 10,
            }}>{t.preview.tool1_title}</div>
            <p style={{ fontSize: "0.82rem", opacity: 0.9, lineHeight: 1.6, marginBottom: 16, flexGrow: 1 }}>
              {t.preview.tool1_desc}
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px 0" }}>
              {t.preview.tool1_features.map((f: string, i: number) => (
                <li key={i} style={{ fontSize: "0.78rem", opacity: 0.85, marginBottom: 6 }}>✓ {f}</li>
              ))}
            </ul>
            <button onClick={() => goToTool("retirement")} style={{
              background: "white", color: C.teal,
              border: `2px solid ${C.ink}`, borderRadius: 12,
              boxShadow: `2px 2px 0 ${C.ink}`, padding: "10px 20px",
              fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
              fontFamily: "'IBM Plex Mono', monospace",
            }}>{t.hero.cta}</button>
          </div>

          {/* Tool 2 — Net Worth */}
          <div style={{
            background: C.mustard, color: "white", border: `2px solid ${C.ink}`,
            borderRadius: 18, boxShadow: `4px 4px 0 ${C.ink}`, padding: "24px 20px",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{
              display: "inline-block", fontSize: "0.7rem", fontWeight: 700,
              padding: "3px 10px", borderRadius: 999,
              border: "2px solid rgba(255,255,255,0.4)",
              background: "rgba(255,255,255,0.15)", marginBottom: 12, alignSelf: "flex-start",
            }}>{t.preview.tool2_tag}</div>
            <div style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "1.3rem", fontWeight: 700, marginBottom: 10,
            }}>{t.preview.tool2_title}</div>
            <p style={{ fontSize: "0.82rem", opacity: 0.9, lineHeight: 1.6, marginBottom: 16, flexGrow: 1 }}>
              {t.preview.tool2_desc}
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px 0" }}>
              {t.preview.tool2_features.map((f: string, i: number) => (
                <li key={i} style={{ fontSize: "0.78rem", opacity: 0.85, marginBottom: 6 }}>✓ {f}</li>
              ))}
            </ul>
            <button onClick={() => goToTool("networth")} style={{
              background: "white", color: C.mustard,
              border: `2px solid ${C.ink}`, borderRadius: 12,
              boxShadow: `2px 2px 0 ${C.ink}`, padding: "10px 20px",
              fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
              fontFamily: "'IBM Plex Mono', monospace",
            }}>{t.hero.cta}</button>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: `2px solid rgba(27,27,27,0.1)`,
        padding: "1.5rem", textAlign: "center",
        fontSize: "0.75rem", opacity: 0.4,
      }}>
        <p>{t.footer.built}</p>
        <p>{t.footer.tagline}</p>
      </footer>

    </main>
  );
}
