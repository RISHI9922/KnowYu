import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono, Montserrat } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "KnowYu",
  description: "Ask questions about the provided documents.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${jetBrainsMono.variable} ${montserrat.variable}`}
      >
        <a className="skip-link" href="#main-content">
          Skip to chat
        </a>
        <div className="app-shell">
          <main id="main-content" className="chat-main">
            <header className="app-brand">
              <h1>KnowYu</h1>
            </header>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
