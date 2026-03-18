"use client";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
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

export default function AuthPage({ onBack, locale = "en" }: { onBack: () => void; locale?: string }) {
  const t = (MESSAGES[locale] || MESSAGES.en).auth;

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.2rem" }}>

      {/* Header */}
      <h1 style={{ fontWeight: 800, fontSize: "1.8rem", marginBottom: 4 }}>
        {t.title}
      </h1>
      <p style={{ fontSize: 13, opacity: 0.55, marginBottom: "1.5rem" }}>
        {t.subtitle}
      </p>

      {/* Auth card */}
      <div style={{
        background: C.cream,
        border: `2px solid ${C.ink}`,
        borderRadius: 18,
        padding: "20px 20px",
        boxShadow: `3px 3px 0 ${C.ink}`,
        marginBottom: 16,
      }}>
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: C.teal,
                  brandAccent: C.mustard,
                  inputBackground: "white",
                  inputBorder: C.ink,
                  inputText: C.ink,
                },
                radii: {
                  borderRadiusButton: "14px",
                  inputBorderRadius: "14px",
                },
                fonts: {
                  bodyFontFamily: "IBM Plex Mono, monospace",
                  buttonFontFamily: "IBM Plex Mono, monospace",
                },
              },
            },
          }}
          providers={["google"]}
          redirectTo={typeof window !== "undefined" ? window.location.origin : ""}
        />
      </div>

      {/* Back button */}
      <button onClick={onBack} style={{
        background: C.cream,
        color: C.ink,
        border: `2px solid ${C.ink}`,
        borderRadius: 14,
        boxShadow: `2px 2px 0 ${C.ink}`,
        padding: "10px 20px",
        fontWeight: 700,
        fontSize: 14,
        cursor: "pointer",
      }}>
        {t.back}
      </button>

    </main>
  );
}
