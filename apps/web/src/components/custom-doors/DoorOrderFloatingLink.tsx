import { useEffect, useState } from "react";
import { DoorOpen } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { jsonRequest } from "../../lib/auth/request";

export function DoorOrderFloatingLink() {
  const { pathname } = useLocation();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    void jsonRequest<{ enabled: boolean }>("/api/v1/custom-doors/visibility")
      .then((r) => {
        if (alive) setEnabled(r.data.enabled);
      })
      .catch(() => {
        /* Fail closed when visibility cannot be read. */
      });
    return () => {
      alive = false;
    };
  }, []);
  if (
    !enabled ||
    [
      "/custom-doors",
      "/checkout",
      "/cart",
      "/payment",
      "/account",
      "/orders",
    ].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) ||
    pathname === "/payment-return"
  )
    return null;
  const product =
    pathname.startsWith("/products/") || pathname.startsWith("/product/");
  return (
    <Link
      to="/custom-doors"
      className={`custom-door-floating ${product ? "custom-door-floating-product" : ""}`}
    >
      <DoorOpen size={21} aria-hidden="true" />
      <span>سفارش درب فریم‌لس و دکوفیکس</span>
    </Link>
  );
}
