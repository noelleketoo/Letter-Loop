import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";

export const metadata: Metadata = {
  title: { default: "Circle Letter", template: "%s · Circle Letter" },
  description: "A monthly newsletter written by you and your friends.",
  appleWebApp: { title: "Circle Letter", capable: true, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e7" },
    { media: "(prefers-color-scheme: dark)", color: "#17130f" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden>✉</span>
              <span>Circle Letter</span>
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
        <footer className="site-footer">Made with ✉ for friends who live far apart.</footer>
      </body>
    </html>
  );
}
