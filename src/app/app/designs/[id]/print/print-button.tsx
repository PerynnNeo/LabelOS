"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Client "Print / Save as PDF" trigger for the tech-pack print view
 * (spec section 18). Uses the browser's own print dialog — no PDF library.
 * Co-located next to the server page (the page stays a Server Component so it
 * can read the design from the service-role repository layer).
 */
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="primary"
      onClick={() => window.print()}
      className="no-print"
    >
      <Printer aria-hidden className="size-4" />
      Print / Save as PDF
    </Button>
  );
}
