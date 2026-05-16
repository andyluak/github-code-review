import * as React from "react";

import { cn } from "@/lib/utils";

type SlabToggleGroupProps = React.ComponentProps<"div"> & {
  "aria-label": string; // required for accessibility
};

/**
 * Visual wrapper for a row of SlabButtons that form a toggle group.
 * Renders a 1px --rd-hair border around the group and 1px dividers
 * between children. Exactly one child should have variant="active";
 * the caller manages active state.
 *
 * Children should be <SlabButton> instances. Other children render
 * but won't get dividers.
 */
function SlabToggleGroup({
  className,
  children,
  ...props
}: SlabToggleGroupProps) {
  return (
    <div
      data-slot="slab-toggle-group"
      role="group"
      className={cn(
        "inline-flex border border-[var(--rd-hair)] divide-x divide-[var(--rd-hair)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { SlabToggleGroup };
export type { SlabToggleGroupProps };
