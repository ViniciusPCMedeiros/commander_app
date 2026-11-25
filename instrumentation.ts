/**
 * Agendador semanal: roda uma vez por servidor (Node.js) e, a cada 5 minutos,
 * chama a rotina da semana que fechou (Gazeta + análises dos jogadores). A rota
 * só gera o que ainda não existe: na prática, tudo sai logo depois da meia-noite
 * de domingo para segunda (ou quando o servidor voltar, se estava desligado), e
 * uma única vez por semana.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const flags = globalThis as { __mesaoWeeklyScheduler?: boolean };
  if (flags.__mesaoWeeklyScheduler) return;
  flags.__mesaoWeeklyScheduler = true;

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return;
  const url = `http://127.0.0.1:${process.env.PORT || 3000}/api/cron/weekly`;

  const tick = async () => {
    try {
      await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
    } catch {
      // servidor ainda subindo ou banco fora do ar: tenta de novo no próximo ciclo
    }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, 5 * 60_000).unref();
}
