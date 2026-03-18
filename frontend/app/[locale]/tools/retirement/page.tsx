"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import RetirementCalculator from "@/components/RetirementCalculator";
import { supabase } from "@/lib/supabase";

export default function RetirementPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "en";
  const [user, setUser] = useState<any>(null);
  const [currency, setCurrency] = useState("EUR");

  useEffect(() => {
    const saved = sessionStorage.getItem("currency");
    if (saved) setCurrency(saved);

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
  }, []);

  return (
    <RetirementCalculator
      currency={currency}
      user={user}
      locale={locale}
      onBack={() => router.push(`/${locale}`)}
    />
  );
}
