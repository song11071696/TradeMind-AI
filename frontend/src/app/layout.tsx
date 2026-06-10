import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YieldMind - AI-Powered Yield Optimization",
  description: "DeFi yield optimization powered by AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
