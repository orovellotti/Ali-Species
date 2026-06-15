import type { TaxonMedia } from "@workspace/api-client-react";
import { Image as ImageIcon, ZoomIn } from "lucide-react";
import { proxyImg } from "@/lib/proxyImg";

/**
 * Sidebar image gallery. Renders a stacked list of proxied images (click to
 * zoom via `onZoom`) or a placeholder when there is nothing to show.
 */
export function TaxonGallery({
  images,
  alt,
  onZoom,
}: {
  images: TaxonMedia["images"] | undefined;
  alt: string;
  onZoom: (url: string) => void;
}) {
  if (!images || images.length === 0) {
    return (
      <div className="aspect-[4/3] rounded-2xl bg-muted border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
        <ImageIcon className="w-10 h-10 mb-3 opacity-20" />
        <p className="text-sm">Aucune image disponible</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {images.map((img, i) => (
        <div
          key={i}
          className="group relative rounded-2xl overflow-hidden bg-muted border border-border shadow-sm cursor-zoom-in"
          onClick={() => onZoom(proxyImg(img.url))}
        >
          <img
            src={proxyImg(img.url)}
            alt={img.title || alt}
            className="w-full h-auto object-cover object-center max-h-[500px]"
            loading={i === 0 ? "eager" : "lazy"}
            data-testid={`img-taxon-${i}`}
          />
          <div className="absolute top-3 right-3 p-1.5 rounded-full bg-black/30 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
            <ZoomIn className="w-4 h-4" />
          </div>
          {(img.title || img.author) && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10">
              {img.title && <p className="text-white text-xs font-medium line-clamp-1">{img.title}</p>}
              {img.author && <p className="text-white/70 text-[10px] mt-0.5">{img.author}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
