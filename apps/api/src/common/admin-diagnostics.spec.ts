import { describe, expect, it } from "vitest";
import {
  adminDiagnosticOperation,
  logClientFailure,
} from "@iranyaragh/contracts";
import { vi } from "vitest";

describe("Admin operation labels", () => {
  it("joins create, description, status, media and import stages using fixed labels", () => {
    const requests = [
      ["POST", "/api/v1/catalog/admin/products", "catalog.product.create"],
      [
        "PATCH",
        "/catalog/admin/products/:id/description",
        "catalog.product.description.save",
      ],
      [
        "POST",
        "/catalog/admin/products/:id/status",
        "catalog.product.status.change",
      ],
      [
        "POST",
        "/catalog/admin/products/:productId/media/uploads",
        "catalog.media.upload.prepare",
      ],
      [
        "POST",
        "/catalog/admin/products/:productId/media/:mediaId/confirm",
        "catalog.media.upload.confirm",
      ],
      ["POST", "/catalog/admin/imports/:id/dry-run", "catalog.import.validate"],
      ["POST", "/catalog/admin/imports/:id/commit", "catalog.import.commit"],
    ];
    for (const [method, path, operation] of requests) {
      expect(adminDiagnosticOperation(method, path)).toEqual({
        surface: "admin",
        area: "catalog",
        operation,
      });
    }
  });
  it("discards private dynamic values, queries and unsupported routes/methods", () => {
    expect(
      adminDiagnosticOperation(
        "PATCH",
        "/catalog/admin/products/private@example.com/description?password=private",
      ),
    ).toEqual({
      surface: "admin",
      area: "catalog",
      operation: "catalog.product.description.save",
    });
    for (const path of [
      "/catalog/products",
      "/inventory/public/stock",
      "/customers/me",
      "https://private/admin",
      "x".repeat(4097),
    ]) {
      expect(adminDiagnosticOperation("GET", path)).toBeUndefined();
    }
    expect(
      adminDiagnosticOperation("OPTIONS", "/catalog/admin/products"),
    ).toBeUndefined();
    expect(
      adminDiagnosticOperation(
        "GET",
        "/invoices/admin/documents/:id/pdf/artifact/",
      ),
    ).toEqual({
      surface: "admin",
      area: "invoices",
      operation: "invoices.read",
    });
    expect(
      adminDiagnosticOperation("PATCH", "/catalog/admin/attributes/:id"),
    ).toEqual({
      surface: "admin",
      area: "catalog",
      operation: "catalog.write",
    });
  });
  it("adds browser failure labels without copying URLs, bodies or customer references", () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      logClientFailure("admin", "synthetic-reference", "http", 409, {
        method: "PATCH",
        path: "/catalog/admin/variants/private@example.com/price?secret=private",
      });
      const line = String(log.mock.calls[0][0]);
      expect(JSON.parse(line)).toMatchObject({
        event: "client.request.failed",
        requestId: "synthetic-reference",
        statusCode: 409,
        surface: "admin",
        area: "catalog",
        operation: "catalog.variant.price.change",
      });
      expect(line).not.toMatch(/private|secret|@|\?/u);
    } finally {
      log.mockRestore();
    }
  });
});
