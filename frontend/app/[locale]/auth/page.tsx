"use client";
import { useParams, useRouter } from "next/navigation";
import AuthPage from "@/components/AuthPage";

export default function Auth() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "en";

  return (
  <AuthPage onBack={() => router.push(`/${locale}`)} locale={locale} />
)