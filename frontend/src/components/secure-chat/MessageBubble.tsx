import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  text: string;
  sent: boolean;
  time: string;
  isSecure: boolean;
  index?: number;
}

const scrambleText = (text: string) => {
  const chars = "█▓▒░╔╗╚╝║═╬╣╠╦╩";
  return text.split("").map(() => chars[Math.floor(Math.random() * chars.length)]).join("");
};

export const MessageBubble = ({ text, sent, time, isSecure, index = 0 }: MessageBubbleProps) => (
  <div
    className={cn("flex animate-message-in", sent ? "justify-end" : "justify-start")}
    style={{ animationDelay: `${index * 0.05}s` }}
  >
    <div className={cn(
      "max-w-[75%] rounded-2xl px-4 py-3 transition-all duration-500 shadow-sm",
      sent
        ? "bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-tr-md shadow-indigo-500/20"
        : "bg-slate-800/80 border border-white/5 text-slate-100 rounded-tl-md"
    )}>
      <p className={cn(
        "text-sm leading-relaxed blur-transition",
        !isSecure ? "blur-[8px] opacity-40 select-none" : "blur-0 opacity-100"
      )}>
        {isSecure ? text : scrambleText(text)}
      </p>
      <div className={cn(
        "flex justify-end mt-1.5 blur-transition",
        !isSecure ? "blur-[6px] opacity-30" : "blur-0 opacity-100"
      )}>
        <span className={cn(
          "text-[10px] font-medium tracking-wide",
          sent ? "text-indigo-200" : "text-slate-400"
        )}>
          {time}
        </span>
      </div>
    </div>
  </div>
);
