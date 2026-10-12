import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

// The SSR provider requires a syntactically valid endpoint at module load.
// Rendering the shell does not contact Convex, so use a local test-only URL.
process.env.NEXT_PUBLIC_CONVEX_URL ??= "http://127.0.0.1:3210";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("build embeds a configured Convex URL in the browser client", async () => {
  const assetDir = new URL("../dist/client/assets/", import.meta.url);
  const assets = await readdir(assetDir);
  const providerFile = assets.find((name) => /^ConvexClientProvider-.*\.js$/.test(name));
  assert.ok(providerFile, "Convex provider client chunk exists");
  const provider = await readFile(new URL(providerFile, assetDir), "utf8");
  assert.doesNotMatch(provider, /NEXT_PUBLIC_CONVEX_URL/);
  assert.match(provider, /new [A-Za-z_$][\w$]*\([^)]*https?:\/\//, "Convex client has a valid build-time URL");
});
