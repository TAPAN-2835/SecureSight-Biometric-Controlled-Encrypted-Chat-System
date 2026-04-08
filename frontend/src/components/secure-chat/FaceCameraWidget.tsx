import { cn } from "@/lib/utils";

interface FaceCameraWidgetProps {
  isSecure: boolean;
  onToggle: () => void; // kept for interface compatibility
}

export const FaceCameraWidget = ({ isSecure }: FaceCameraWidgetProps) => (
  <div className="fixed top-5 right-20 z-50 flex items-center justify-center gap-2 px-3 py-1.5 rounded-full bg-[#0f172a]/90 backdrop-blur-md border border-white/10 shadow-md">
    <div className="relative flex h-2 w-2">
      <span className={cn(
        "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
        isSecure ? "bg-green-400" : "bg-red-400"
      )}></span>
      <span className={cn(
        "relative inline-flex rounded-full h-2 w-2",
        isSecure ? "bg-green-500" : "bg-red-500"
      )}></span>
    </div>
    <span className="text-[10px] font-medium text-slate-300 tracking-wide uppercase">
      Scanning Vault
    </span>
  </div>
);
