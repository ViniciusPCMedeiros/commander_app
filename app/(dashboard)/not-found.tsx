import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

export default function NotFound() {
  return (
    <div>
      <PageHeader
        eyebrow="Exilado"
        title="Não encontrado"
        description="Esse registro foi para o exílio — talvez tenha sido removido, ou o link está errado."
        actions={
          <Button asChild>
            <Link href="/">Voltar ao painel</Link>
          </Button>
        }
      />
    </div>
  );
}
