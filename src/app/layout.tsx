import type { Metadata } from "next";
import "@fontsource-variable/inter/opsz.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thread | PR brief & Plan check",
  description:
    "Resume your GitHub work with a PR brief. Connect Notion to compare project plans with public GitHub work and inspect the evidence.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
