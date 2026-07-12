import { integrationStatus } from "@/lib/env";
import {
  getAppSettings,
  listProducts,
  type ProductRow,
} from "@/lib/supabase/repositories";
import { isSetupError } from "@/app/app/_lib/server";
import { PageHeader } from "@/app/app/_components/page-header";
import { SetupCard } from "@/app/app/_components/setup-card";
import { CatalogView } from "@/app/app/_components/catalog-view";

/**
 * Catalog (spec 23): the product library with grid/list views, filters, upload,
 * Shopify import, and per-product / batch analysis. Data is loaded server-side
 * and handed to the interactive client grid. A setup error degrades gracefully.
 */
export const dynamic = "force-dynamic";

interface CatalogData {
  configured: boolean;
  products: ProductRow[];
  currency: string;
}

async function loadCatalog(): Promise<CatalogData> {
  try {
    const [products, settings] = await Promise.all([
      listProducts(),
      getAppSettings(),
    ]);
    return {
      configured: true,
      products,
      currency: settings?.currency ?? "SGD",
    };
  } catch (error) {
    if (isSetupError(error)) {
      return { configured: false, products: [], currency: "SGD" };
    }
    throw error;
  }
}

export default async function CatalogPage() {
  const status = integrationStatus();
  const data = await loadCatalog();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Library"
        title="Catalog"
        description="Every garment in your studio. Analyse products to enrich them with category, colour, and styling metadata the agents rely on."
      />

      {!data.configured ? (
        <SetupCard description="Connect Supabase to upload, import, and analyse products." />
      ) : (
        <CatalogView
          products={data.products}
          currency={data.currency}
          demoMode={status.demoMode}
          shopifyLive={status.shopifyConfigured}
        />
      )}
    </div>
  );
}
