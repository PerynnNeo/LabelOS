"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";

/**
 * Runs (or re-runs) the garment analysis for a single product and refreshes the
 * current route on completion. Used on the full product detail page.
 */
export function AnalyseButton({
  productId,
  label = "Analyse",
  variant = "primary",
}: {
  productId: string;
  label?: string;
  variant?: ButtonVariant;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const result = await apiRequest<{ reused: boolean }>(
        `/api/products/${productId}/analyse`,
        { method: "POST" },
      );
      toast.success(
        result.reused
          ? "Loaded the existing analysis."
          : "Analysis complete.",
      );
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant={variant} loading={loading} onClick={handleClick}>
      <ScanLine aria-hidden className="size-4" />
      {label}
    </Button>
  );
}
