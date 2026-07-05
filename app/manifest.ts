import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Based Turtle",
    short_name: "Based Turtle",
    description:
      "Adopt a tiny turtle: feed it, wash it and send it to the sea. Come back every day to keep it happy and grow it from Baby to Giant.",
    start_url: "/",
    display: "standalone",
    background_color: "#071A33",
    theme_color: "#071A33",
    icons: [
      {
        src: "/turtle-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/turtle-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
