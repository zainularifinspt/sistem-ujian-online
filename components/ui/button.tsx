import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-bold transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "clay-btn clay-btn-primary",
        destructive: "clay-btn clay-btn-destructive",
        outline: "clay-btn clay-btn-outline",
        secondary: "clay-btn clay-btn-secondary",
        ghost: "hover:bg-slate-100 hover:text-slate-900 rounded-xl transition-all",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-12 px-5 py-2.5",
        sm: "h-10 px-4",
        lg: "h-14 px-8 text-base",
        icon: "h-12 w-12 rounded-2xl"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
