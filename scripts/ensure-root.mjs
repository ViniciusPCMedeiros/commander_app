// Garante que existe uma conta root (conta de sistema, invisível para os demais).
// Funciona no Supabase local ou na nuvem — usa NEXT_PUBLIC_SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY. Se já houver root, não faz nada.
//
//   ROOT_EMAIL=... ROOT_PASSWORD=... node --env-file=.env.local scripts/ensure-root.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: roots, error } = await admin.from("users").select("email").eq("role", "root");
if (error) {
  console.error("Não foi possível consultar os usuários:", error.message);
  process.exit(1);
}
if (roots.length) {
  console.log(`EXISTS ${roots.map((r) => r.email).join(", ")}`);
  process.exit(0);
}

const email = process.env.ROOT_EMAIL?.trim().toLowerCase();
const password = process.env.ROOT_PASSWORD ?? "";
const name = process.env.ROOT_NAME?.trim() || "Root";
if (!email || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
  console.error("MISSING Defina ROOT_EMAIL (e-mail válido) e ROOT_PASSWORD (mínimo 8 caracteres).");
  process.exit(2);
}

const { data, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { name },
  app_metadata: { role: "root" },
});
if (createError) {
  console.error("Falha ao criar o root:", createError.message);
  process.exit(1);
}
// O GoTrue grava app_metadata depois do INSERT, então o trigger cria o perfil como "member".
const { error: roleError } = await admin.from("users").update({ role: "root" }).eq("id", data.user.id);
if (roleError) {
  console.error("Conta criada, mas falhou ao definir o papel root:", roleError.message);
  process.exit(1);
}
console.log(`CREATED ${email}`);
