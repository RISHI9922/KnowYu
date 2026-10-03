import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono, Montserrat } from "next/font/google";
import type { ReactNode } from "react";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

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
    { media: "(prefers-color-scheme: light)", color: "#F9F8F8" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1115" },
  ],
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('knowyu-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.setAttribute('data-theme','dark');}else if(t==='light'){document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${dmSans.variable} ${jetBrainsMono.variable} ${montserrat.variable}`}
      >
        <a className="skip-link" href="#main-content">
          Skip to chat
        </a>
        <div className="app-topbar">
          <ThemeToggle />
        </div>
        <div className="app-shell">
          <main id="main-content" className="chat-main">
            <div className="app-brand">
              <Logo size={24} className="app-brand-logo" />
              <h1 className="app-brand-wordmark">KnowYu</h1>
            </div>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
