/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/** Arte do comandante; com parceiro, divide a imagem ao meio. */
export function CommanderArt({
  image,
  partnerImage,
  alt,
  className,
}: {
  image: string | null | undefined;
  partnerImage?: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <div className={cn("relative flex overflow-hidden bg-muted", className)}>
      {image ? (
        <img src={image} alt={alt} className={cn("h-full object-cover", partnerImage ? "w-1/2" : "w-full")} loading="lazy" />
      ) : (
        <div className="flex size-full items-center justify-center text-xs text-muted-foreground">sem arte</div>
      )}
      {partnerImage && (
        <img src={partnerImage} alt={`${alt} (parceiro)`} className="h-full w-1/2 object-cover" loading="lazy" />
      )}
    </div>
  );
}
