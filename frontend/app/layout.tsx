import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CROWD_FLOW // OPTIMISER",
  description: "Decentralized multi-agent crowd management. Execute, don't observe.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="scanlines min-h-screen antialiased">{children}</body>
    </html>
  );
}
