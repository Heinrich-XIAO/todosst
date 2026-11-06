import type { MetadataRoute } from "next";

// PWA manifest — installing on iOS (Add to Home Screen) is what unlocks web
// push there; on Android/desktop it gives standalone windows + an app icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "todosst",
    short_name: "todosst",
    description: "hierarchical todo app",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    // long-press the home-screen icon: jump straight into capturing a problem
    shortcuts: [
      {
        name: "Capture a problem",
        short_name: "Capture",
        description: "Write down what just went wrong",
        url: "/loop",
      },
      {
        name: "Capture by voice",
        short_name: "Voice",
        description: "Say what just went wrong",
        url: "/loop?capture=voice",
      },
    ],
    // appears in the Android share sheet: share a page or text into the loop inbox
    share_target: {
      action: "/loop",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
