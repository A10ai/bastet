import type { Metadata } from "next";
import { Inter, DM_Sans, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "HospitAI — The AI Operating System for Hotels",
  description:
    "AI-powered property management for aparthotels and extended-stay properties.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Per-request CSP nonce from src/middleware.ts. Reading headers() also opts
  // every page out of static prerendering, which the nonce CSP requires.
  const nonce = headers().get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('hospitai-theme');
                if (t === 'light') document.documentElement.classList.add('light');
                else document.documentElement.classList.add('dark');
              } catch(e) { document.documentElement.classList.add('dark'); }
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${dmSans.variable} ${jetbrainsMono.variable} font-sans antialiased bg-bastet-bg text-text-primary theme-transition`}
      >
        {children}
      </body>
    </html>
  );
}
