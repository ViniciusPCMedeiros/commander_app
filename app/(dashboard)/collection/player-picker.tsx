"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/native-select";

export function PlayerPicker({ players, value }: { players: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  return (
    <NativeSelect
      aria-label="Ver coleção de"
      value={value}
      onChange={(e) => router.push(`/collection?user=${e.target.value}`)}
      className="w-48"
    >
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </NativeSelect>
  );
}
