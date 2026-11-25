"use client";

import { useEffect } from "react";
import { markVersionSeen } from "@/lib/changelog";

/** Abrir as novidades apaga o pontinho de "versão nova" do menu. */
export function MarkSeen() {
  useEffect(() => markVersionSeen(), []);
  return null;
}
