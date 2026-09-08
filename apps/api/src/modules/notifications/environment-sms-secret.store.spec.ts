import { describe, expect, it } from "vitest";
import { EnvironmentSmsSecretStore } from "./environment-sms-secret.store";

describe("EnvironmentSmsSecretStore", () => {
  it("reports only masked capability metadata", async () => {
    const secret = "private-sms-ir-key";
    const store = new EnvironmentSmsSecretStore(secret);

    expect(await store.getStatus()).toEqual({
      backend: "environment",
      capability: "read_only",
      configured: true,
    });
    expect(JSON.stringify(await store.getStatus())).not.toContain(secret);
    expect(await store.resolve()).toBe(secret);
  });

  it.each([undefined, "", " ", " key", "key ", "key\0suffix"])(
    "fails closed for an absent or malformed environment value",
    async (secret) => {
      const store = new EnvironmentSmsSecretStore(secret);
      expect(await store.getStatus()).toEqual({
        backend: "environment",
        capability: "read_only",
        configured: false,
      });
      expect(await store.resolve()).toBeNull();
    },
  );

  it("returns stable unsupported results and never changes its snapshot", async () => {
    const store = new EnvironmentSmsSecretStore("original-key");

    expect(await store.rotate("replacement-key")).toEqual({
      status: "unsupported_operation",
    });
    expect(await store.clear()).toEqual({
      status: "unsupported_operation",
    });
    expect(await store.resolve()).toBe("original-key");
    expect(await store.getStatus()).toEqual({
      backend: "environment",
      capability: "read_only",
      configured: true,
    });
  });
});
