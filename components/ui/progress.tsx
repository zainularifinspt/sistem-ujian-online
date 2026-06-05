import * as React from "react";

import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("relative h-3.5 w-full overflow-hidden rounded-full clay-progress-track bg-slate-100", className)}
      {...props}
    >
      <div
        className="h-full w-full flex-1 clay-progress-bar transition-all"
        style={{ transform: `translateX(-${100 - Math.max(0, Math.min(100, value))}%)` }}
      />
    </div>
  )
);
Progress.displayName = "Progress";

export { Progress };
