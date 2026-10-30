import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { currentUser } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { LogoMark } from "@/components/Logo";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["SOFT", "opsz"] });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: { default: "Blink Loop", template: "%s · Blink Loop" },
  description: "Our monthly letter to each other.",
  appleWebApp: { title: "Blink Loop", capable: true, statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcf8f6" },
    { media: "(prefers-color-scheme: dark)", color: "#16131c" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en" className={`${fraunces.variable} ${jakarta.variable}`}>
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              <LogoMark />
              <span>Blink Loop</span>
            </Link>
            <nav className="nav">
              {user ? (
                <>
                  <Link href="/" className="navlink">My groups</Link>
                  <Link href="/account" aria-label="Account" style={{ display: "inline-flex" }}>
                    <Avatar name={user.name} email={user.email} />
                  </Link>
                </>
              ) : (
                <Link href="/login" className="btn small">Sign in</Link>
              )}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">Blink Loop · just for us ♡</footer>
      </body>
    </html>
  );
}
