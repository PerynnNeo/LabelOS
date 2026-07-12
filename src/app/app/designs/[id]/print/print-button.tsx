"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/lo";

/**
 * Client "Print / Save as PDF" trigger for the tech-pack print view. Uses the
 * browser's own print dialog — no PDF library. Co-located next to the server
 * page (which stays a Server Component so it can read the design from the
 * service-role repository layer).
 */
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      onClick={() => window.print()}
      className="no-print"
    >
      <Printer aria-hidden className="size-4" />
      Print / Save as PDF
    </Button>
  );
}
