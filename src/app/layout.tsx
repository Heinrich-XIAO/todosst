import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { EncryptionProvider } from "@/components/EncryptionContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "todosst",
  description: "A minimal, fast todo app built with Next.js, Convex, and Convex Auth (username/password)",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "todosst",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

// viewport-fit=cover lets the standalone PWA draw edge-to-edge; header and
// bottom nav pad themselves with env(safe-area-inset-*).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

const themeInitScript = `(function(){try{var t=localStorage.getItem("todosst-theme"),d=document.documentElement;if(t==="light"||t==="dark"){d.classList.remove("light","dark");d.classList.add(t);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* theme init runs before first paint; as the first child of <body> it
            is valid HTML — React 19 rejects <script> as a child of <html> */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ConvexAuthNextjsServerProvider>
          <ConvexClientProvider>
            <EncryptionProvider>{children}</EncryptionProvider>
          </ConvexClientProvider>
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  );
}
