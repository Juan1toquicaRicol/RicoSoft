import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-blue-800 text-white shadow-2xs hover:bg-blue-900 active:bg-blue-950",
        destructive: "bg-red-600 text-white shadow-2xs hover:bg-red-700 active:bg-red-800",
        success: "bg-emerald-600 text-white shadow-2xs hover:bg-emerald-700 active:bg-emerald-800",
        outline:
          "border border-slate-300 bg-white text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400",
        secondary: "bg-slate-100 text-slate-900 shadow-2xs hover:bg-slate-200/80",
        ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        link: "text-blue-700 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 text-xs sm:text-sm",
        xs: "h-7 rounded-md px-2.5 text-xs font-semibold",
        sm: "h-8 rounded-md px-3 text-xs font-semibold",
        lg: "h-10 rounded-md px-6 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
