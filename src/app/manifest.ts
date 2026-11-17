import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "JobApply",
    short_name: "JobApply",
    description: "Find jobs, prepare applications, and track your next opportunity.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f4ef",
    theme_color: "#1d5c4c",
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Find jobs", url: "/jobs" },
      { name: "My applications", url: "/applications" },
    ],
  };
}
