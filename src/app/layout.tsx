import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

// No next/font/google here on purpose: builds must work offline, so the
// theme relies on web-safe font stacks defined in globals.css (@theme).

export const metadata: Metadata = {
  title: "LabelOS",
  description:
    "LabelOS — the agentic operating system for one-person e-commerce fashion labels: catalog analysis, styling, product development, sourcing, and Shopify publishing with human approval.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-dvh flex-col bg-paper font-sans text-ink">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
