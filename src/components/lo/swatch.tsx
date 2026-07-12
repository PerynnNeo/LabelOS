import { swatchStyle } from "@/lib/ui/tokens";
import { cn } from "@/lib/utils";

/**
 * Fabric-swatch placeholder used wherever a garment has no real photo: a
 * deterministic tonal gradient (`swatchStyle(seed)`) under a diagonal hatch
 * (`.lo-hatch`), with an optional bottom-left file-name chip (mono) or a plain
 * label, and a spinner overlay while analysing. When `imageUrl` is provided the
 * real image is shown instead (object-cover) and the hatch is dropped.
 */
export type SwatchAspect = "3/4" | "4/5" | "16/9" | "1/1";

export interface SwatchProps {
  /** Stable string (product id/title) driving the gradient. */
  seed: string;
  /** Plain caption text, bottom-left (e.g. an outfit item name). */
  label?: string;
  /** Mono file-name chip, bottom-left (e.g. "hero-01.jpg"). */
  file?: string;
  /** Real image URL — rendered object-cover in place of the gradient. */
  imageUrl?: string;
  /** Show the analysing spinner overlay. */
  running?: boolean;
  aspect?: SwatchAspect;
  /** Corner radius in px (default 10). */
  rounded?: number;
  className?: string;
}

export function Swatch({
  seed,
  label,
  file,
  imageUrl,
  running,
  aspect = "4/5",
  rounded = 10,
  className,
}: SwatchProps) {
  return (
    <div
      className={cn(
        "relative flex items-end overflow-hidden p-[9px]",
        !imageUrl && "lo-hatch",
        className,
      )}
      style={{
        aspectRatio: aspect.replace("/", " / "),
        borderRadius: rounded,
        ...(imageUrl ? undefined : swatchStyle(seed)),
      }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- demo/signed URLs, no next/image loader
        <img
          src={imageUrl}
          alt={label ?? file ?? ""}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}

      {running ? (
        <div className="absolute inset-0 z-[2] flex items-center justify-center bg-white/45">
          <span className="size-[22px] animate-[lo-spin_0.8s_linear_infinite] rounded-full border-[2.5px] border-[rgba(10,132,255,0.25)] border-t-accent" />
        </div>
      ) : null}

      {file ? (
        <span className="relative z-[1] rounded-[5px] bg-white/70 px-1.5 py-0.5 font-mono text-[9.5px] text-black/45">
          {file}
        </span>
      ) : label ? (
        <span className="relative z-[1] text-[9.5px] leading-tight text-black/50">
          {label}
        </span>
      ) : null}
    </div>
  );
}
