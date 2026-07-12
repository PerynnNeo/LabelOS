import { integrationStatus } from "@/lib/env";
import {
  getAppSettings,
  listProducts,
  type ProductRow,
} from "@/lib/supabase/repositories";
import { PageHeader, SetupCard } from "@/components/lo";
import { isSetupError } from "@/app/app/_lib/server";
import { CatalogView } from "./_components/catalog-view";

/**
 * Catalog (spec 23): the product library — grid, filters, upload, Shopify
 * import, and per-product / batch analysis. Products load server-side and hand
 * off to the interactive client grid, which renders the frosted header and its
 * Import / Add-product actions. A Supabase setup error degrades to a setup card
 * instead of crashing the page.
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

  if (!data.configured) {
    return (
      <div>
        <PageHeader
          title="Catalog"
          subtitle="Upload, import, and analyse your garments."
        />
        <div className="px-[30px] pt-4 pb-11">
          <SetupCard
            service="Supabase"
            message="Connect Supabase to upload, import, and analyse products. Until then the catalog has nothing to show — the rest of LabelOS still runs in demo mode."
          />
        </div>
      </div>
    );
  }

  return (
    <CatalogView
      products={data.products}
      currency={data.currency}
      demoMode={status.demoMode}
      shopifyLive={status.shopifyConfigured}
    />
  );
}
