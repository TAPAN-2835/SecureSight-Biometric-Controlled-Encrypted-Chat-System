export const AnimatedBackground = () => (
  <div className="absolute inset-0 overflow-hidden">
    <div
      className="absolute inset-0 opacity-[0.15] animate-mesh-shift"
      style={{
        background: "linear-gradient(-45deg, #0f172a, #1e1b4b, #172554, #0f172a)",
        backgroundSize: "400% 400%",
      }}
    />
    {/* Floating orbs */}
    {[...Array(5)].map((_, i) => (
      <div
        key={i}
        className="absolute rounded-full opacity-20 animate-float"
        style={{
          width: `${80 + i * 40}px`,
          height: `${80 + i * 40}px`,
          left: `${10 + i * 18}%`,
          top: `${15 + (i % 3) * 25}%`,
          background: i % 2 === 0
            ? "radial-gradient(circle, rgba(99, 102, 241, 0.15), transparent)"
            : "radial-gradient(circle, rgba(168, 85, 247, 0.1), transparent)",
          animationDelay: `${i * 1.2}s`,
          animationDuration: `${5 + i}s`,
        }}
      />
    ))}
  </div>
);
