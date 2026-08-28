import type { Metadata } from "next";
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
  description: "A minimal, fast todo app built with Next.js, Convex, and Convex Auth (email/password)",
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
      <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ConvexAuthNextjsServerProvider>
          <ConvexClientProvider>
            <EncryptionProvider>{children}</EncryptionProvider>
          </ConvexClientProvider>
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  );
}
