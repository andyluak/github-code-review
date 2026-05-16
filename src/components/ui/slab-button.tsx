import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const slabButtonVariants = cva(
  // base: hard edges, no rounded corners, lowercase Bricolage voice,
  // relative positioning for the ::before hover stripe, transitions
  // tuned to match the global 120ms button transition (CSS in index.css)
  "relative inline-flex shrink-0 items-center gap-1.5 border-0 font-voice font-semibold lowercase whitespace-nowrap select-none outline-none transition-[background-color,color,padding,box-shadow] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--rd-vermillion)] focus-visible:ring-offset-0",
  {
    variants: {
      variant: {
        // Neutral slab. Transparent at rest. On hover: ink-4 fill +
        // 3px vermillion left stripe slides in + 4px left-padding bump.
        default: [
          "bg-transparent text-[var(--rd-cream)]",
          "hover:bg-[var(--rd-ink-4)] hover:pl-[calc(var(--slab-px)+4px)]",
          "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0 before:bg-[var(--rd-vermillion)] before:transition-[width] before:duration-[180ms]",
          "hover:before:w-[3px]",
        ].join(" "),

        // Solid vermillion. No stripe (already filled). Used for non-toggle
        // active state (currently same visual as `primary`; kept distinct
        // so callers can express intent in the variant name).
        active: [
          "bg-[var(--rd-vermillion)] text-[#1A0F0A]",
          "hover:bg-[var(--rd-vermillion-2)]",
        ].join(" "),

        // Solid vermillion, bolder weight. The strongest action.
        primary: [
          "bg-[var(--rd-vermillion)] text-[#1A0F0A] font-bold",
          "hover:bg-[var(--rd-vermillion-2)]",
        ].join(" "),

        // Neutral at rest; on hover, fill + stripe in DEL color instead
        // of vermillion. For "undo review", "delete".
        danger: [
          "bg-transparent text-[var(--rd-cream)]",
          "hover:bg-[var(--rd-ink-4)] hover:pl-[calc(var(--slab-px)+4px)]",
          "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0 before:bg-[var(--rd-del)] before:transition-[width] before:duration-[180ms]",
          "hover:before:w-[3px]",
        ].join(" "),
      },
      size: {
        // Toolbar slab — 12px font, comfortable padding
        default:
          "[--slab-px:16px] px-4 py-3 text-[12px] tracking-[0.02em] [letter-spacing:0.02em]",
        // Inline note action — denser
        sm:
          "[--slab-px:10px] px-2.5 py-1.5 text-[11px] tracking-[0.02em] [letter-spacing:0.02em]",
        // Icon-only square slab — same hover stripe behavior, no padding bump
        // because there's no text to shift right of.
        icon:
          "[--slab-px:8px] size-8 justify-center hover:!pl-[8px]",
        // Compact toolbar slab — for top bar where 12px feels too big
        compact:
          "[--slab-px:10px] px-2.5 h-8 text-[11px] tracking-[0.02em] [letter-spacing:0.02em]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type SlabButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof slabButtonVariants>;

function SlabButton({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: SlabButtonProps) {
  return (
    <button
      type={type}
      data-slot="slab-button"
      data-variant={variant}
      data-size={size}
      className={cn(slabButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { SlabButton, slabButtonVariants };
export type { SlabButtonProps };
