"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";

interface SeedResult {
  productsInserted: number;
  productsSkipped: number;
  suppliersInserted: number;
  collectionInserted: boolean;
  settingsUpserted: boolean;
}

/**
 * Loads the deterministic demo dataset (products, suppliers, brand, sample
 * collection) via POST /api/seed. Only rendered when DEMO_MODE is on. Idempotent
 * server-side, so it is safe to press more than once.
 */
export function SeedButton({
  variant = "primary",
  size = "md",
}: {
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSeed() {
    if (loading) return;
    setLoading(true);
    try {
      const result = await apiRequest<SeedResult>("/api/seed", {
        method: "POST",
      });
      toast.success(
        `Demo data ready — ${result.productsInserted} product(s) added` +
          (result.productsSkipped > 0
            ? `, ${result.productsSkipped} already present`
            : "") +
          `, ${result.suppliersInserted} supplier(s), collection ${
            result.collectionInserted ? "created" : "already present"
          }.`,
      );
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant={variant} size={size} loading={loading} onClick={handleSeed}>
      <Sparkles aria-hidden className="size-4" />
      Seed demo data
    </Button>
  );
}
