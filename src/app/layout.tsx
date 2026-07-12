import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

// Instrument Serif (display face in the design) is loaded via a stylesheet
// link with a Georgia fallback, so a production build never needs network
// access to a font CDN — if the link fails, the serif fallback is used.

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
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh bg-canvas font-sans text-ink">
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
