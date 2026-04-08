export const AnimatedBackground = () => (
  <div className="absolute inset-0 overflow-hidden">
    <div
      className="absolute inset-0 opacity-30 animate-mesh-shift"
      style={{
        background: "linear-gradient(-45deg, hsl(240 20% 4%), hsl(263 68% 20%), hsl(190 100% 15%), hsl(240 20% 8%))",
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
            ? "radial-gradient(circle, hsl(190 100% 44% / 0.4), transparent)"
            : "radial-gradient(circle, hsl(263 68% 56% / 0.4), transparent)",
          animationDelay: `${i * 1.2}s`,
          animationDuration: `${5 + i}s`,
        }}
      />
    ))}
  </div>
);
