import { ProductMediaManager } from "@/components/catalog/ProductMediaManager";

export default async function ProductMediaPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <ProductMediaManager productId={productId} />;
}
