import "./globals.css";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import { getTheme } from "@/lib/theme";
import ThemeToggle from "./theme-toggle";
import NavLinks from "@/components/nav-links";

export const metadata = {
  title: "Recaptação",
  description: "Recaptação de pacientes para atendimento médico",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getTheme();
  const bare = (await headers()).get("x-pathname") === "/login";
  if (bare)
    return (
      <html lang="pt-BR" className={theme === "dark" ? "dark" : ""} suppressHydrationWarning>
        <body suppressHydrationWarning>
          <main className="content">{children}</main>
          <Toaster position="top-center" theme={theme === "dark" ? "dark" : "light"} />
        </body>
      </html>
    );
  return (
    <html lang="pt-BR" className={theme === "dark" ? "dark" : ""} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div className="layout">
          <aside className="sidebar">
            <div className="brand-row">
              <strong className="brand">Recaptação</strong>
              <ThemeToggle initial={theme} />
            </div>
            <NavLinks />
            <form action="/api/logout" method="post" className="logout">
              <button type="submit" className="btn-danger">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sair
              </button>
            </form>
          </aside>
          <main className="content">{children}</main>
        </div>
        <Toaster position="top-center" theme={theme === "dark" ? "dark" : "light"} />
      </body>
    </html>
  );
}
