export const runtime = "edge";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

function base64(bytes: Uint8Array): string {
  let result = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
  }
  return btoa(result);
}

function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: unknown }).type === "output_text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") return text;
      }
    }
  }
  return null;
}

function clampNumber(value: unknown, minimum: number, maximum: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.round(Math.min(maximum, Math.max(minimum, number)) * 10) / 10;
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BYTES + 200_000) {
      return Response.json({ error: "That photo is larger than 8 MB." }, { status: 413, headers: responseHeaders });
    }

    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File)) {
      return Response.json({ error: "Choose a meal photo first." }, { status: 400, headers: responseHeaders });
    }
    if (!ALLOWED_TYPES.has(image.type) || image.size > MAX_BYTES) {
      return Response.json({ error: "Use a JPEG, PNG, or WebP photo under 8 MB." }, { status: 415, headers: responseHeaders });
    }

    const workerRuntime = await import("cloudflare:workers");
    const runtimeEnv = workerRuntime.env as unknown as Record<string, string | undefined>;
    const browserKey = request.headers.get("x-dayframe-openai-key")?.trim() ?? "";
    const apiKey = runtimeEnv.OPENAI_API_KEY || (browserKey.length <= 512 ? browserKey : "");
    if (!apiKey) {
      return Response.json(
        { error: "Photo estimates are not configured yet. You can still log this meal manually.", code: "MEAL_ANALYSIS_NOT_CONFIGURED" },
        { status: 503, headers: responseHeaders },
      );
    }

    const bytes = new Uint8Array(await image.arrayBuffer());
    const imageUrl = `data:${image.type};base64,${base64(bytes)}`;
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["name", "calories", "proteinGrams", "carbsGrams", "fatGrams", "confidence", "items", "note"],
      properties: {
        name: { type: "string", description: "Short, plain-language meal name" },
        calories: { type: "number", description: "Estimated total kilocalories" },
        proteinGrams: { type: "number" },
        carbsGrams: { type: "number" },
        fatGrams: { type: "number" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        items: { type: "array", items: { type: "string" }, maxItems: 12 },
        note: { type: "string", description: "One concise uncertainty note about portion size, ingredients, or preparation" },
      },
    };

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: runtimeEnv.OPENAI_VISION_MODEL || "gpt-5.6-terra",
        reasoning: { effort: "low" },
        instructions: "Estimate visible food and portions conservatively. Return a useful ballpark, never claim exactness. If the image is not a meal or is too unclear, use low confidence, zero values, and explain why in the note. Do not provide medical advice.",
        input: [{ role: "user", content: [{ type: "input_text", text: "Estimate the total calories and macronutrients for everything intended to be eaten in this photo." }, { type: "input_image", image_url: imageUrl, detail: "low" }] }],
        text: { format: { type: "json_schema", name: "meal_estimate", strict: true, schema } },
        max_output_tokens: 500,
      }),
    });

    if (!upstream.ok) {
      return Response.json({ error: "The photo could not be analyzed right now. Enter the meal manually and try again later." }, { status: 502, headers: responseHeaders });
    }

    const payload = await upstream.json();
    const outputText = extractOutputText(payload);
    if (!outputText) throw new Error("Vision response did not include an estimate");
    const estimate = JSON.parse(outputText) as Record<string, unknown>;

    return Response.json({
      estimate: {
        name: typeof estimate.name === "string" ? estimate.name.slice(0, 100) : "Meal",
        calories: clampNumber(estimate.calories, 0, 5000),
        proteinGrams: clampNumber(estimate.proteinGrams, 0, 500),
        carbsGrams: clampNumber(estimate.carbsGrams, 0, 800),
        fatGrams: clampNumber(estimate.fatGrams, 0, 500),
        confidence: ["low", "medium", "high"].includes(String(estimate.confidence)) ? estimate.confidence : "low",
        items: Array.isArray(estimate.items) ? estimate.items.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
        note: typeof estimate.note === "string" ? estimate.note.slice(0, 280) : "Portion sizes and hidden ingredients may change this estimate.",
      },
    }, { headers: responseHeaders });
  } catch {
    return Response.json({ error: "The photo could not be analyzed. Enter the meal manually instead." }, { status: 500, headers: responseHeaders });
  }
}
