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

/**
 * Modelos em ordem de preferência (AI_MODEL aceita uma lista separada por vírgula).
 * Use versões fixas (ex.: gemini-3.6-flash), não aliases "-latest": assim o modelo
 * não muda sozinho. No plano gratuito, sobrecarga (503) ou cota esgotada (429)
 * só devolvem erro — nunca cobrança — e o próximo modelo da lista é tentado.
 */
function aiModels(): string[] {
  const list = (process.env.AI_MODEL || "gemini-2.5-flash")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return list.length ? list : ["gemini-2.5-flash"];
}

export async function generateAICompletion(
  prompt: string,
  systemPrompt: string,
  fallback: () => string,
): Promise<{ content: string; source: "ai" | "fallback"; model?: string }> {
  const baseUrl = (process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, "");

  if (!isAIConfigured()) {
    console.warn("AI_API_KEY ausente ou placeholder. Usando gerador local de fallback.");
    return { content: fallback(), source: "fallback" };
  }

  for (const model of aiModels()) {
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
        // Sobrecarga/cota/erro do servidor: tenta o próximo modelo. Outros erros (chave inválida etc.) param aqui.
        const retry = response.status === 429 || response.status >= 500;
        console.warn(`IA (${model}) respondeu ${response.status}${retry ? "; tentando o próximo modelo" : ""}.`);
        if (retry) continue;
        break;
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content) return { content, source: "ai", model };
    } catch (error) {
      console.error(`Falha ao comunicar com a IA (${model}):`, error);
    }
  }
  return { content: fallback(), source: "fallback" };
}
