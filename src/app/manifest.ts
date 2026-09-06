import type { MetadataRoute } from "next";

// PWA manifest — installing on iOS (Add to Home Screen) is what unlocks web
// push there; on Android/desktop it gives standalone windows + an app icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "todosst",
    short_name: "todosst",
    description: "E2E-encrypted hierarchical todo vault",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
