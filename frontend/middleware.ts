import createMiddleware from "next-intl/middleware";

export default createMiddleware({
  locales: ["en", "id", "zh"],
  defaultLocale: "en",
});

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};