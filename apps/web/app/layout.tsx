import "@primer/primitives/dist/css/primitives.css";
import "@primer/primitives/dist/css/functional/themes/dark.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Hallway",
  description: "Plan your conference around who you are: people to meet, sessions and side events.",
  appleWebApp: { capable: true, title: "Hallway", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0d1117",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-color-mode="dark" data-dark-theme="dark" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
