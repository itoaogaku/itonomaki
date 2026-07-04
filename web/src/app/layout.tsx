import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { getSections, getTopics } from "@/lib/content";

export const metadata: Metadata = {
  title: {
    default: "トレーナー知見ライブラリ",
    template: "%s | トレーナー知見ライブラリ",
  },
  description: "フィジカル・メンタル・部位別・種目別・トレーナー知見をまとめたナレッジベース",
  robots: { index: false, follow: false },
};

// Runs before hydration to set the theme without a flash of the wrong colors.
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const sections = getSections().map((section) => ({
    slug: section.slug,
    title: section.title,
    topics: getTopics(section.slug),
  }));

  return (
    <html lang="ja" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full min-h-full antialiased" suppressHydrationWarning>
        <AppShell sections={sections}>{children}</AppShell>
      </body>
    </html>
  );
}
