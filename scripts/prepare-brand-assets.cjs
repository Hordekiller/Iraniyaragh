const path = require("node:path");
const sharp = require(
  require.resolve("sharp", { paths: [path.join(__dirname, "../apps/api")] }),
);
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
(async () => {
  const mark = path.join(root, "assets/brand/source/mark.png"),
    word = path.join(root, "assets/brand/source/wordmark.png");
  const outputs = {};
  for (const size of [64, 128])
    outputs[`mark-${size}.webp`] = await sharp(mark)
      .resize(size, size)
      .webp({ lossless: true, effort: 6 })
      .toBuffer();
  for (const size of [432, 864])
    outputs[`wordmark-${size}.webp`] = await sharp(word)
      .resize({ width: size })
      .webp({ lossless: true, effort: 6 })
      .toBuffer();
  outputs["favicon-32.png"] = await sharp(mark)
    .resize(32, 32)
    .png({ compressionLevel: 9 })
    .toBuffer();
  outputs["apple-touch-icon.png"] = await sharp(mark)
    .resize(180, 180)
    .png({ compressionLevel: 9 })
    .toBuffer();
  outputs["wordmark-print.png"] = await sharp(word)
    .resize({ width: 1086 })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const manifest = { revision: "brand-name-correction-2026-10-26", sources: {}, files: {} };
  for (const [name, p] of Object.entries({ mark, wordmark: word }))
    manifest.sources[name] = crypto
      .createHash("sha256")
      .update(await fs.readFile(p))
      .digest("hex");
  for (const [name, bytes] of Object.entries(outputs)) {
    const m = await sharp(bytes).metadata();
    manifest.files[name] = {
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      width: m.width,
      height: m.height,
    };
  }
  for (const app of ["admin", "web"]) {
    const dir = path.join(root, `apps/${app}/public/brand`);
    await fs.mkdir(dir, { recursive: true });
    for (const [name, bytes] of Object.entries(outputs)) {
      const target = path.join(dir, name);
      if (process.argv.includes("--check")) {
        if (!bytes.equals(await fs.readFile(target)))
          throw new Error("Generated brand asset differs.");
      } else await fs.writeFile(target, bytes);
    }
  }
  const manifestPath = path.join(root, "assets/brand/manifest.json");
  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (manifestText !== (await fs.readFile(manifestPath, "utf8")))
      throw new Error("Brand manifest differs.");
  } else await fs.writeFile(manifestPath, manifestText);
  console.log(
    JSON.stringify({
      generatedBytes: Object.values(outputs).reduce(
        (sum, b) => sum + b.length,
        0,
      ),
      files: manifest.files,
    }),
  );
})().catch(() => {
  console.error("Brand asset generation failed.");
  process.exitCode = 1;
});
