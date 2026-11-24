#!/usr/bin/env bash
# =====================================================================
# Mesão — sobe tudo de uma vez (Supabase local + .env.local + Next.js)
#
#   ./start.sh            dependências, Supabase, migrations, .env e app (modo dev)
#   ./start.sh --prod     o mesmo, mas com build de produção (next build + next start)
#   ./start.sh stop       para o Supabase local (os dados são mantidos)
#   ./start.sh reset      recria o banco do zero, limpo (só a conta root). Apaga os dados!
#   ./start.sh reset --demo   idem, com dados de exemplo (jogadores, decks, partidas)
#   ./start.sh help       mostra esta ajuda
#   -y, --yes             aceita as perguntas de instalação automaticamente
#
# Banco novo começa limpo: o script cria só a conta root (invisível para os demais),
# com ROOT_EMAIL/ROOT_PASSWORD do ambiente ou do .env.local — ou perguntando.
# Se faltar Node.js 20.9+ ou Docker, o script oferece instalar (o Docker usa sudo).
# Pode rodar quantas vezes quiser: cada passo só faz algo se for necessário.
# =====================================================================
set -euo pipefail

ORIG_ARGS=("$@")
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
ASSUME_YES=0
SUDO=""
NVM_VERSION="v0.40.3"
NODE_MAJOR=22

# Serviços do Supabase que o app não usa (sobe mais rápido e com menos memória)
SUPABASE_EXCLUDE="realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor"
ENV_FILE=".env.local"

if [ -t 1 ]; then
  B=$'\e[1m'; DIM=$'\e[2m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; N=$'\e[0m'
else
  B=""; DIM=""; G=""; Y=""; R=""; C=""; N=""
fi
step() { printf "\n%s==>%s %s%s%s\n" "$C" "$N" "$B" "$1" "$N"; }
ok()   { printf "    %s✔%s %s\n" "$G" "$N" "$1"; }
warn() { printf "    %s!%s %s\n" "$Y" "$N" "$1"; }
die()  { printf "\n%s✖ %s%s\n" "$R" "$1" "$N" >&2; exit 1; }

usage() { sed -n '3,16p' "$SCRIPT_PATH" | sed 's/^# \{0,1\}//'; }

supabase() { npx --no-install supabase "$@"; }
supabase_running() { supabase status >/dev/null 2>&1; }

# ---------------------------------------------------------------------
# Pré-requisitos do sistema (Node.js e Docker), com instalação opcional
# ---------------------------------------------------------------------

# confirm "pergunta" → 0 se sim. Com -y aceita direto; sem terminal interativo, recusa.
confirm() {
  if [ "$ASSUME_YES" = 1 ]; then printf "    %s → sim (-y)\n" "$1"; return 0; fi
  [ -t 0 ] || return 1
  local answer
  printf "    %s%s%s [S/n] " "$Y" "$1" "$N"
  read -r answer
  [[ -z "$answer" || "$answer" =~ ^[sSyY] ]]
}

# Garante privilégios de administrador; o sudo pede a senha (uma vez) quando preciso.
need_sudo() {
  if [ "$(id -u)" = 0 ]; then SUDO=""; return; fi
  command -v sudo >/dev/null || die "Preciso de privilégios de administrador para $1, mas o sudo não está instalado."
  SUDO="sudo"
  if ! sudo -n true 2>/dev/null; then
    printf "    %sO sudo vai pedir sua senha para %s.%s\n" "$DIM" "$1" "$N"
    sudo -v || die "Não foi possível obter permissão de administrador (sudo)."
  fi
}

pkg_install() {
  need_sudo "instalar $*"
  if command -v apt-get >/dev/null; then $SUDO apt-get update -qq && $SUDO apt-get install -y -qq "$@"
  elif command -v dnf >/dev/null; then $SUDO dnf install -y -q "$@"
  elif command -v pacman >/dev/null; then $SUDO pacman -S --noconfirm --needed "$@"
  elif command -v zypper >/dev/null; then $SUDO zypper -n install "$@"
  else die "Gerenciador de pacotes não reconhecido. Instale manualmente: $*"
  fi
}

ensure_curl() {
  command -v curl >/dev/null && return 0
  confirm "O curl (usado para os downloads) não está instalado. Instalar? (usa sudo)" || die "Instale o curl e rode de novo."
  pkg_install curl ca-certificates
}

node_ok() {
  command -v node >/dev/null &&
    node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=9)?0:1)' 2>/dev/null
}

# Carrega o nvm se existir (num shell não interativo ele não vem carregado). O nvm não é compatível com "set -eu".
load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  [ -s "$NVM_DIR/nvm.sh" ] || return 1
  set +eu
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use --silent default >/dev/null 2>&1
  set -eu
  return 0
}

ensure_node() {
  if node_ok; then ok "Node $(node -v)"; return; fi
  if load_nvm && node_ok; then ok "Node $(node -v) (via nvm)"; return; fi

  if command -v node >/dev/null; then warn "Node $(node -v) é antigo demais (o Next.js 16 precisa do 20.9+)."
  else warn "Node.js não encontrado."; fi
  confirm "Instalar o Node.js $NODE_MAJOR (LTS) via nvm? (não usa sudo; fica só no seu usuário)" ||
    die "Instale o Node 20.9+ (https://nodejs.org) e rode de novo."
  ensure_curl
  if ! load_nvm; then
    printf "    Baixando o nvm %s…\n" "$NVM_VERSION"
    curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh" | bash >/dev/null 2>&1 ||
      die "Falha ao instalar o nvm."
    load_nvm || die "O nvm foi instalado, mas não pôde ser carregado."
  fi
  printf "    Baixando o Node.js %s…\n" "$NODE_MAJOR"
  set +eu
  nvm install "$NODE_MAJOR" >/dev/null 2>&1 && nvm alias default "$NODE_MAJOR" >/dev/null 2>&1
  set -eu
  node_ok || die "Falha ao instalar o Node.js via nvm."
  ok "Node $(node -v) instalado (em terminais novos ele já fica disponível)"
}

# ok | missing | stopped | denied
docker_state() {
  command -v docker >/dev/null || { echo missing; return; }
  local err
  if err="$(docker info 2>&1 >/dev/null)"; then echo ok; return; fi
  if grep -qi "permission denied" <<<"$err"; then echo denied; else echo stopped; fi
}

ensure_docker() {
  local state
  state="$(docker_state)"

  if [ "$state" = missing ]; then
    [ "$(uname -s)" = Darwin ] &&
      die "Docker não encontrado. Instale o Docker Desktop (https://www.docker.com/products/docker-desktop/), abra-o e rode de novo."
    grep -qi microsoft /proc/version 2>/dev/null &&
      warn "WSL detectado: o recomendado é o Docker Desktop no Windows com a integração WSL ativada."
    confirm "Docker não encontrado. Instalar agora? (usa sudo)" ||
      die "Instale o Docker (https://docs.docker.com/engine/install/) e rode de novo."
    ensure_curl
    need_sudo "instalar o Docker"
    # shellcheck disable=SC1091
    if (. /etc/os-release 2>/dev/null; [[ " ${ID:-} ${ID_LIKE:-} " == *" arch "* ]]); then
      pkg_install docker
    else
      # Script oficial: Ubuntu, Debian, Fedora, CentOS/RHEL, Raspberry Pi OS…
      curl -fsSL https://get.docker.com | $SUDO sh || die "Falha ao instalar o Docker."
    fi
    state="$(docker_state)"
    [ "$state" = missing ] && die "A instalação terminou, mas o comando docker não foi encontrado."
    ok "Docker instalado"
  fi

  if [ "$state" = stopped ]; then
    confirm "O Docker não está rodando. Iniciar o serviço (e deixá-lo ligado no boot)? (usa sudo)" ||
      die "Inicie o Docker e rode de novo."
    need_sudo "iniciar o Docker"
    if command -v systemctl >/dev/null; then
      $SUDO systemctl enable --now docker >/dev/null 2>&1 || $SUDO systemctl start docker
    else
      $SUDO service docker start
    fi
    for _ in $(seq 1 30); do
      state="$(docker_state)"
      [ "$state" = stopped ] || break
      sleep 1
    done
    [ "$state" = stopped ] && die "O Docker não subiu. Veja o motivo com: sudo journalctl -u docker"
  fi

  if [ "$state" = denied ]; then
    [ -n "${MESAO_DOCKER_GROUP:-}" ] &&
      die "Mesmo no grupo docker, ainda sem permissão. Saia e entre de novo na sessão (ou reinicie) e rode o script."
    confirm "Seu usuário não tem permissão para usar o Docker. Adicionar '$USER' ao grupo docker? (usa sudo)" ||
      die "Rode: sudo usermod -aG docker \$USER (depois saia e entre de novo na sessão)."
    need_sudo "dar ao seu usuário permissão de usar o Docker"
    $SUDO usermod -aG docker "$USER"
    ok "'$USER' adicionado ao grupo docker"
    # O grupo novo só vale em sessões novas; continua já nesta execução via "sg", sem precisar sair.
    command -v sg >/dev/null || die "Saia e entre de novo na sessão e rode o script."
    exec sg docker -c "MESAO_DOCKER_GROUP=1 $(printf '%q ' "$SCRIPT_PATH" "${ORIG_ARGS[@]}")"
  fi

  ok "Docker rodando"
}

check_prereqs() {
  step "Verificando pré-requisitos"
  ensure_node
  command -v npm >/dev/null || die "npm não encontrado (ele vem junto com o Node.js)."
  ensure_docker
}

install_deps() {
  step "Dependências (npm)"
  # Reinstala só se o package-lock.json mudou desde a última instalação feita por este script
  local stamp="node_modules/.start-sh-lock-hash" hash
  hash="$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(require("fs").readFileSync("package-lock.json")).digest("hex"))')"
  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$hash" ]; then
    ok "Já instaladas"
  elif [ -d node_modules ] && [ ! -f "$stamp" ] && npm ls --depth=0 >/dev/null 2>&1; then
    echo "$hash" > "$stamp"   # instaladas antes do script existir e consistentes com o lock
    ok "Já instaladas"
  else
    npm ci --no-audit --no-fund
    echo "$hash" > "$stamp"
    ok "Dependências instaladas"
  fi
}

start_supabase() {
  step "Supabase local"
  if supabase_running; then
    ok "Já está rodando"
    # Banco existente: aplica só as migrations novas (não apaga dados)
    local out
    out="$(supabase migration up 2>&1)" || { printf "%s\n" "$out"; die "Falha ao aplicar migrations."; }
    if grep -q "Applying migration" <<<"$out"; then
      grep "Applying migration" <<<"$out" | sed 's/^/    /'
      ok "Migrations novas aplicadas"
    else
      ok "Banco já está com todas as migrations"
    fi
  else
    warn "Iniciando (na primeira vez baixa as imagens Docker e pode levar alguns minutos)…"
    # Banco novo: o start aplica migrations + seed automaticamente.
    # Banco já existente (volume mantido): aplicamos as migrations pendentes logo depois.
    supabase start -x "$SUPABASE_EXCLUDE" >/dev/null || die "Falha ao iniciar o Supabase. Rode 'npx supabase start' para ver o erro."
    supabase migration up >/dev/null 2>&1 || die "Falha ao aplicar migrations."
    ok "Supabase no ar"
  fi
}

# Lê uma variável do .env.local (vazio se não existir)
env_get() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }

write_env() {
  step "Configuração (.env.local)"
  local status api anon service
  status="$(supabase status -o env 2>/dev/null)" || die "Não foi possível ler 'supabase status'."
  api="$(grep -E '^API_URL=' <<<"$status" | cut -d= -f2- | tr -d '"')"
  anon="$(grep -E '^ANON_KEY=' <<<"$status" | cut -d= -f2- | tr -d '"')"
  service="$(grep -E '^SERVICE_ROLE_KEY=' <<<"$status" | cut -d= -f2- | tr -d '"')"
  [ -n "$api" ] && [ -n "$anon" ] && [ -n "$service" ] || die "Chaves do Supabase não encontradas no 'supabase status'."

  if [ "$(env_get NEXT_PUBLIC_SUPABASE_URL)" = "$api" ] &&
     [ "$(env_get NEXT_PUBLIC_SUPABASE_ANON_KEY)" = "$anon" ] &&
     [ "$(env_get SUPABASE_SERVICE_ROLE_KEY)" = "$service" ]; then
    ok "Já configurado"
  else
    # Preserva a configuração de IA existente (ex.: sua chave real do Gemini)
    local ai_url ai_model ai_key
    ai_url="$(env_get AI_BASE_URL)";  ai_url="${ai_url:-https://generativelanguage.googleapis.com/v1beta/openai}"
    ai_model="$(env_get AI_MODEL)";   ai_model="${ai_model:-gemini-2.5-flash}"
    ai_key="$(env_get AI_API_KEY)";   ai_key="${ai_key:-placeholder}"
    local backup="" extra=""
    if [ -f "$ENV_FILE" ]; then
      cp "$ENV_FILE" "$ENV_FILE.bak"; backup=" (anterior salvo em $ENV_FILE.bak)"
      # Mantém variáveis que não são geradas aqui (ex.: ROOT_EMAIL)
      extra="$(grep -E '^[A-Z_][A-Z0-9_]*=' "$ENV_FILE" | grep -vE '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|AI_BASE_URL|AI_MODEL|AI_API_KEY)=' || true)"
    fi
    cat > "$ENV_FILE" <<EOF
# Supabase local (gerado por ./start.sh a partir de \`npx supabase status\`)
NEXT_PUBLIC_SUPABASE_URL=$api
NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon
SUPABASE_SERVICE_ROLE_KEY=$service

# Provedor de IA (Google Gemini Gratuito - Google AI Studio)
# Enquanto AI_API_KEY=placeholder, o app usa o gerador local de fallback.
AI_BASE_URL=$ai_url
AI_MODEL=$ai_model
AI_API_KEY=$ai_key
EOF
    if [ -n "$extra" ]; then printf "\n# Outras variáveis\n%s\n" "$extra" >> "$ENV_FILE"; fi
    ok "$ENV_FILE gerado$backup"
  fi

  local key; key="$(env_get AI_API_KEY)"
  if [ -z "$key" ] || [ "$key" = "placeholder" ]; then
    warn "IA em modo local. Para usar o Gemini, coloque sua chave em AI_API_KEY no $ENV_FILE"
    printf "      %s(grátis em https://aistudio.google.com/apikey) e rode o script de novo.%s\n" "$DIM" "$N"
  else
    ok "Chave do Gemini configurada"
  fi
}

# Garante a conta root (scripts/ensure-root.mjs). Na primeira vez pergunta e-mail e senha;
# grava só o e-mail no .env.local (a senha nunca fica salva).
ensure_root() {
  step "Conta root"
  local out code=0
  out="$(node --env-file="$ENV_FILE" scripts/ensure-root.mjs 2>&1)" || code=$?
  case "$out" in
    EXISTS*) ok "Root já existe (${out#EXISTS })"; return ;;
    CREATED*) ok "Root criado: ${out#CREATED }"; return ;;
  esac
  [ "$code" -eq 2 ] || die "Falha ao verificar/criar o root: $out"
  [ -t 0 ] || die "Nenhuma conta root. Defina ROOT_EMAIL e ROOT_PASSWORD (ambiente ou .env.local) e rode de novo."

  warn "Ainda não há conta root (a conta de administração, invisível para os demais). Vamos criar:"
  local email="${ROOT_EMAIL:-}" p1 p2
  while [[ ! "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; do read -rp "    E-mail do root: " email; done
  while :; do
    read -rsp "    Senha (mínimo 8 caracteres): " p1; echo
    read -rsp "    Repita a senha: " p2; echo
    [ "$p1" = "$p2" ] && [ "${#p1}" -ge 8 ] && break
    warn "As senhas não conferem ou são curtas demais."
  done
  out="$(ROOT_EMAIL="$email" ROOT_PASSWORD="$p1" node --env-file="$ENV_FILE" scripts/ensure-root.mjs 2>&1)" ||
    die "Falha ao criar o root: $out"
  grep -q '^ROOT_EMAIL=' "$ENV_FILE" || printf "\n# Conta root (a senha não é salva)\nROOT_EMAIL=%s\n" "$email" >> "$ENV_FILE"
  ok "Root criado: ${out#CREATED }"
}

# Carrega os dados de exemplo (supabase/seed.demo.sql) no banco local.
load_demo() {
  local project
  project="$(grep -E '^project_id' supabase/config.toml | cut -d'"' -f2)"
  docker exec -i "supabase_db_${project}" psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/seed.demo.sql >/dev/null ||
    die "Falha ao carregar os dados de exemplo."
  ok "Dados de exemplo carregados (root de demonstração: admin@commander.local / Admin@123)"
}

port_in_use() {
  if command -v ss >/dev/null; then ss -ltn 2>/dev/null | grep -qE "[:.]$1\s"
  else (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
  fi
}

pick_port() {
  local port="${PORT:-3000}"
  while port_in_use "$port"; do port=$((port + 1)); done
  echo "$port"
}

banner() {
  local url="$1" studio ROOT_EMAIL_SHOWN
  ROOT_EMAIL_SHOWN="$(env_get ROOT_EMAIL)"
  studio="$(supabase status -o env 2>/dev/null | grep -E '^STUDIO_URL=' | cut -d= -f2- | tr -d '"')"
  cat <<EOF

${G}${B}Tudo pronto!${N}

  App              ${B}$url${N}
  Supabase Studio  ${studio:-http://127.0.0.1:54323}

  Login   sua conta root${ROOT_EMAIL_SHOWN:+ ($ROOT_EMAIL_SHOWN)}; crie os membros no painel Admin.

  ${DIM}${2:-Ctrl+C para parar o app. }O Supabase continua rodando (pare com: ./start.sh stop).${N}

EOF
}

run_app() {
  local mode="$1" port url
  port="$(pick_port)"
  url="http://localhost:$port"
  if [ "$mode" = "prod" ]; then
    step "Build de produção"
    npm run build
    [ "$port" != "${PORT:-3000}" ] && warn "Porta ${PORT:-3000} ocupada; usando $port"
    banner "$url"
    exec npx --no-install next start -p "$port"
  else
    step "Iniciando o app (modo desenvolvimento)"
    # O Next 16 não permite dois "next dev" na mesma pasta; se já houver um, só mostramos o endereço
    local lock=".next/dev/lock" pid
    if [ -f "$lock" ]; then
      pid="$(node -p 'JSON.parse(require("fs").readFileSync(".next/dev/lock","utf8")).pid' 2>/dev/null || true)"
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        url="$(node -p 'JSON.parse(require("fs").readFileSync(".next/dev/lock","utf8")).appUrl' 2>/dev/null || echo "$url")"
        ok "O app já está rodando (PID $pid)"
        banner "$url" "Para reiniciar o app: kill $pid && ./start.sh. "
        exit 0
      fi
    fi
    [ "$port" != "${PORT:-3000}" ] && warn "Porta ${PORT:-3000} ocupada; usando $port"
    banner "$url"
    exec npx --no-install next dev -p "$port"
  fi
}

# ---------------------------------------------------------------------
main() {
  cd "$(dirname "$SCRIPT_PATH")"
  local cmd="up" arg DEMO=0
  for arg in "$@"; do
    case "$arg" in
      -y|--yes) ASSUME_YES=1 ;;
      --demo) DEMO=1 ;;
      *) cmd="$arg" ;;
    esac
  done

  # Node instalado via nvm não vem no PATH de shells não interativos
  node_ok || load_nvm || true

  case "$cmd" in
    up|--dev|"")
      check_prereqs; install_deps; start_supabase; write_env; ensure_root; run_app dev ;;
    --prod|prod)
      check_prereqs; install_deps; start_supabase; write_env; ensure_root; run_app prod ;;
    stop)
      step "Parando o Supabase local (dados mantidos)"
      supabase stop >/dev/null && ok "Parado" ;;
    reset)
      check_prereqs; install_deps
      # Sempre pergunta (o -y vale só para instalações, nunca para apagar dados)
      printf "%sIsto APAGA todos os dados locais e recria o banco do zero.%s Continuar? [s/N] " "$Y" "$N"
      local answer=""
      read -r answer || true
      [[ "$answer" =~ ^[sSyY]$ ]] || { echo "Cancelado."; exit 0; }
      supabase_running || supabase start -x "$SUPABASE_EXCLUDE" >/dev/null
      supabase db reset >/dev/null && ok "Banco recriado (migrations, sem dados)"
      write_env
      if [ "$DEMO" = 1 ]; then load_demo; fi
      ensure_root ;;
    help|-h|--help)
      usage ;;
    *)
      usage; exit 1 ;;
  esac
}

# Executa só quando chamado diretamente (permite carregar as funções em testes)
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
