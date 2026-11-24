"use client";

import { useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { importCollection } from "@/lib/actions/collection";

export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload /> Importar em lote
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar cartas</DialogTitle>
          <DialogDescription>
            Uma carta por linha (&quot;2 Sol Ring&quot;). As quantidades são somadas ao que você já tem. Dados e imagens
            vêm da Scryfall (busca em lote, até 75 por requisição).
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={12}
          className="font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"1 Sol Ring\n2 Cultivate\n1 Esika, God of the Tree\n1 Rhystic Study"}
        />
        <DialogFooter>
          <Button
            disabled={pending || !text.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await importCollection(text);
                if (res.error) {
                  toast.error(res.error);
                  return;
                }
                toast.success(`${res.imported} carta(s) importada(s)`);
                if (res.skippedProxies) toast.info(`${res.skippedProxies} proxy(s) ignorado(s): proxies não entram na coleção física.`);
                if (res.notFound?.length) toast.warning(`Não encontradas: ${res.notFound.join(", ")}`, { duration: 10000 });
                setText("");
                setOpen(false);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />} Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
