import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold transition-all",
  {
    variants: {
      variant: {
        default: "clay-badge clay-badge-info",
        secondary: "clay-badge clay-badge-secondary",
        destructive: "clay-badge clay-badge-destructive",
        outline: "clay-badge clay-badge-secondary",
        success: "clay-badge clay-badge-success",
        warning: "clay-badge clay-badge-warning",
        info: "clay-badge clay-badge-info"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
