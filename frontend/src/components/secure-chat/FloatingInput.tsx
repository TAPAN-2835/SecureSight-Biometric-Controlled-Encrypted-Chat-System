import { cn } from "@/lib/utils";
import { InputHTMLAttributes, useState } from "react";

interface FloatingInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const FloatingInput = ({ label, className, ...props }: FloatingInputProps) => {
  const [focused, setFocused] = useState(false);
  const hasValue = props.value !== undefined ? String(props.value).length > 0 : false;
  const isUp = focused || hasValue;

  return (
    <div className="relative">
      <input
        {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        className={cn(
          "w-full bg-muted/50 border border-border rounded-xl px-4 pt-6 pb-2 text-foreground text-sm outline-none transition-all duration-300",
          "focus:border-primary/60 focus:shadow-[0_0_15px_hsl(var(--neon-blue)/0.15)]",
          "placeholder:text-transparent",
          className
        )}
        placeholder={label}
      />
      <label className={cn(
        "absolute left-4 transition-all duration-300 pointer-events-none",
        isUp
          ? "top-2 text-xs text-primary"
          : "top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
      )}>
        {label}
      </label>
    </div>
  );
};
