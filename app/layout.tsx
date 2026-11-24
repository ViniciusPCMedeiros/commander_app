import type { Metadata, Viewport } from "next";
import { Cinzel, Source_Sans_3, Spectral } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/** Títulos: Cinzel (inscrição gravada, clima de grimório) */
const display = Cinzel({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });
/** Texto corrido: Source Sans 3 */
const body = Source_Sans_3({ variable: "--font-body", subsets: ["latin"] });
/** Jornal: Spectral (serifa editorial) */
const editorial = Spectral({ variable: "--font-editorial", subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: {
    default: "Mesão — Commander Tracker",
    template: "%s · Mesão",
  },
  description: "Estatísticas, decks, coleção e o Jornal Semanal do playgroup de Commander.",
};

export const viewport: Viewport = {
  themeColor: "#17120d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`dark ${display.variable} ${body.variable} ${editorial.variable} h-full antialiased`}>
      <body className="relative flex min-h-full flex-col">
        {children}
        <Toaster theme="dark" richColors position="top-center" />
      </body>
    </html>
  );
}
