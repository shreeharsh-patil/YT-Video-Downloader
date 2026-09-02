import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StreamKit — media downloader",
    short_name: "StreamKit",
    description: "Save media you have permission to download, from supported services.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ee",
    theme_color: "#f6f4ee",
  };
}
