import "server-only";

/**
 * Integração com Gemini via endpoint de compatibilidade OpenAI.
 * Trocar por Ollama/OpenAI = trocar AI_BASE_URL/AI_MODEL/AI_API_KEY.
 *
 * Observação: o AI_BASE_URL do Gemini já termina em /openai, então o
 * caminho correto é `${base}/chat/completions` (sem um /v1 extra).
 */

export function isAIConfigured(): boolean {
  const key = process.env.AI_API_KEY?.trim();
  return Boolean(key) && key !== "placeholder" && !key!.startsWith("sua_");
}

export async function generateAICompletion(
  prompt: string,
  systemPrompt: string,
  fallback: () => string,
): Promise<{ content: string; source: "ai" | "fallback" }> {
  const baseUrl = (process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, "");
  const model = process.env.AI_MODEL || "gemini-2.5-flash";

  if (!isAIConfigured()) {
    console.warn("AI_API_KEY ausente ou placeholder. Usando gerador local de fallback.");
    return { content: fallback(), source: "fallback" };
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(`Erro na API de IA: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    return content ? { content, source: "ai" } : { content: fallback(), source: "fallback" };
  } catch (error) {
    console.error("Falha ao comunicar com a IA:", error);
    return { content: fallback(), source: "fallback" };
  }
}
