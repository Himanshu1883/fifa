import { ShopPageClient } from "@/app/shop/shop-page-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SHOP — Live Marketplace",
  description: "Live Last Minute Sales marketplace availability by match",
};

export default function ShopPage() {
  return <ShopPageClient />;
}
