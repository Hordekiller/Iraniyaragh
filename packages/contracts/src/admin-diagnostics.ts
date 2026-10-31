/** Only fixed operation labels leave this classifier; paths/IDs/queries never do. */
const CATALOG_OPERATIONS: ReadonlyArray<readonly [string, RegExp, string]> = [
  ["POST", /^products$/, "product.create"],
  ["GET", /^products$/, "product.list"],
  ["GET", /^products\/[^/]+$/, "product.read"],
  ["PATCH", /^products\/[^/]+\/description$/, "product.description.save"],
  ["POST", /^products\/[^/]+\/status$/, "product.status.change"],
  ["PATCH", /^products\/[^/]+\/attributes$/, "product.attributes.configure"],
  ["POST", /^products\/[^/]+\/variants\/preview$/, "variant.preview"],
  ["POST", /^products\/[^/]+\/variants\/generate$/, "variant.generate"],
  ["GET", /^products\/[^/]+\/media(?:\/picker)?$/, "media.list"],
  ["POST", /^products\/[^/]+\/media\/uploads$/, "media.upload.prepare"],
  ["PUT", /^products\/[^/]+\/media\/uploads\/bytes$/, "media.upload.bytes"],
  ["POST", /^products\/[^/]+\/media\/[^/]+\/confirm$/, "media.upload.confirm"],
  ["PATCH", /^products\/[^/]+\/media\/[^/]+$/, "media.metadata.update"],
  ["POST", /^products\/[^/]+\/media\/reorder$/, "media.reorder"],
  ["POST", /^products\/[^/]+\/media\/[^/]+\/archive$/, "media.archive"],
  ["POST", /^products\/[^/]+\/media\/[^/]+\/primary$/, "media.primary.change"],
  ["PATCH", /^variants\/[^/]+$/, "variant.update"],
  ["PATCH", /^variants\/[^/]+\/attributes$/, "variant.attributes.save"],
  ["PATCH", /^variants\/[^/]+\/price$/, "variant.price.change"],
  ["GET", /^variants\/[^/]+\/price-history$/, "variant.price.history"],
  ["POST", /^variants\/[^/]+\/status$/, "variant.status.change"],
  ["POST", /^imports$/, "import.upload"],
  ["GET", /^imports\/[^/]+$/, "import.read"],
  ["POST", /^imports\/[^/]+\/dry-run$/, "import.validate"],
  ["POST", /^imports\/[^/]+\/commit$/, "import.commit"],
];

const ADMIN_AREAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/catalog\/admin(?:\/|$)/, "catalog"],
  [/^\/invoices\/admin(?:\/|$)/, "invoices"],
  [/^\/reports\/admin(?:\/|$)/, "reports"],
  [/^\/orders\/admin(?:\/|$)/, "orders"],
  [/^\/customers\/admin(?:\/|$)/, "customers"],
  [/^\/credit\/admin(?:\/|$)/, "credit"],
  [/^\/notifications\/admin(?:\/|$)/, "notifications"],
  [/^\/settings\/admin(?:\/|$)/, "settings"],
  [/^\/audit\/admin(?:\/|$)/, "audit"],
  [/^\/inventory(?:$|\/(?!public(?:\/|$)))/, "inventory"],
  [/^\/(?:purchase-orders|suppliers|stocktakes)(?:\/|$)/, "purchasing"],
];

export function adminDiagnosticOperation(
  method: string,
  path: string,
):
  | {
      surface: "admin";
      area: string;
      operation: string;
    }
  | undefined {
  if (
    !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(method) ||
    path.length > 4096
  )
    return;
  const route = path
    .split("?", 1)[0]
    .replace(/^\/api\/v1(?=\/)/, "")
    .replace(/\/$/, "");
  const area = ADMIN_AREAS.find(([pattern]) => pattern.test(route))?.[1];
  if (!area) return;
  let operation = `${area}.${["GET", "HEAD"].includes(method) ? "read" : "write"}`;
  if (area === "catalog") {
    const suffix = route.slice("/catalog/admin/".length);
    const match = CATALOG_OPERATIONS.find(
      ([verb, pattern]) => verb === method && pattern.test(suffix),
    );
    if (match) operation = `catalog.${match[2]}`;
  }
  return { surface: "admin", area, operation };
}
