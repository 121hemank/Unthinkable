/**
 * All LLM calls go through this file. Every function here NEVER throws —
 * it always returns a result object with a status, so a flaky LLM call
 * can never break a booking or a visit. See §4 of the design doc.
 *
 * Provider: Google Gemini (free tier) via the generativeLanguage REST API.
 */

const TIMEOUT_MS = 60_000; // generous: flash thinking models can take ~30s

interface PreVisitLlmResult {
  status: "OK" | "FAILED";
  urgencyLevel?: "Low" | "Medium" | "High";
  chiefComplaint?: string;
  suggestedQuestions?: string[];
  rawResponse?: string;
}

interface PostVisitLlmResult {
  status: "OK" | "FAILED";
  patientFriendlyText?: string;
  medicationSchedule?: { medicationName: string; timeOfDay: string[] }[];
  followUpSteps?: string;
}

function geminiUrl(): string {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

async function callGeminiOnce(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(geminiUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // Native JSON mode — the model's output is constrained to valid JSON,
        // which makes the parse step below far more reliable.
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Gemini API returned ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No text content in Gemini response");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * One automatic retry for transient provider errors (429 rate limit /
 * 503 high demand), with a short backoff. Persistent failures still
 * propagate to the caller's catch -> llmStatus FAILED path.
 */
async function callGemini(prompt: string): Promise<string> {
  try {
    return await callGeminiOnce(prompt);
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.includes(" 429") || msg.includes(" 503")) {
      await new Promise((r) => setTimeout(r, 2000));
      return callGeminiOnce(prompt);
    }
    throw err;
  }
}

/** Strips markdown code fences if the model wraps its JSON in ```json ... ``` */
function extractJson(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}

export async function generatePreVisitSummary(symptoms: string): Promise<PreVisitLlmResult> {
  const prompt = `Analyse these symptoms and return ONLY a JSON object (no prose, no markdown fences) with keys:
"urgencyLevel" (one of "Low", "Medium", "High"),
"chiefComplaint" (a one-sentence summary),
"suggestedQuestions" (an array of exactly 3 short questions the doctor could ask the patient).
Symptoms: ${symptoms}`;

  try {
    const raw = await callGemini(prompt);
    const parsed = JSON.parse(extractJson(raw));

    if (
      !["Low", "Medium", "High"].includes(parsed.urgencyLevel) ||
      typeof parsed.chiefComplaint !== "string" ||
      !Array.isArray(parsed.suggestedQuestions)
    ) {
      throw new Error("LLM response did not match expected shape");
    }

    return {
      status: "OK",
      urgencyLevel: parsed.urgencyLevel,
      chiefComplaint: parsed.chiefComplaint,
      suggestedQuestions: parsed.suggestedQuestions.slice(0, 3),
      rawResponse: raw,
    };
  } catch (err) {
    console.error("[llmService] pre-visit summary failed:", err);
    return { status: "FAILED" };
  }
}

export async function generatePostVisitSummary(
  clinicalNotes: string,
  prescription: { medicationName: string; dosage: string; frequency: string; durationDays: number }[] = []
): Promise<PostVisitLlmResult> {
  // The structured prescription is included verbatim and the model is
  // forbidden from renaming medicines — otherwise it substitutes generic
  // names ("calpol" -> "Acetaminophen") and patients no longer recognise
  // their own prescription.
  const rxList = prescription.length
    ? prescription
        .map(
          (p, i) =>
            `${i + 1}. ${p.medicationName} — ${p.dosage} — ${p.frequency} — ${p.durationDays} day(s)`
        )
        .join("\n")
    : "(no medicines prescribed)";

  const prompt = `Convert these clinical notes into a patient-friendly summary. Return ONLY a JSON object (no prose, no markdown fences) with keys:
"patientFriendlyText" (a short, plain-language explanation of the visit and diagnosis),
"medicationSchedule" (an array of { "medicationName": string, "timeOfDay": string[] }, times in 24h "HH:MM" format),
"followUpSteps" (a short paragraph on what the patient should do next).
CRITICAL RULES for mentioning medicines:
- Use ONLY the medicine names exactly as written in the prescription below. Never substitute brand/generic alternatives, never add explanations in parentheses after the name.
- Respect the prescribed frequency exactly (e.g. "once daily after dinner" means ONE dose per day).
Medicines prescribed:
${rxList}
Clinical notes: ${clinicalNotes}`;

  try {
    const raw = await callGemini(prompt);
    const parsed = JSON.parse(extractJson(raw));

    if (typeof parsed.patientFriendlyText !== "string" || !Array.isArray(parsed.medicationSchedule)) {
      throw new Error("LLM response did not match expected shape");
    }

    return {
      status: "OK",
      patientFriendlyText: parsed.patientFriendlyText,
      medicationSchedule: parsed.medicationSchedule,
      followUpSteps: parsed.followUpSteps || "",
    };
  } catch (err) {
    console.error("[llmService] post-visit summary failed:", err);
    return { status: "FAILED" };
  }
}
