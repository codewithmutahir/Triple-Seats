export function browserTimer(label: string) {
  const t0 = performance.now();
  const isProd = process.env.NODE_ENV === "production";
  return {
    step: (name: string) => {
      if (!isProd) {
        const ms = Math.round(performance.now() - t0);
        const emoji = ms > 2000 ? "🔴" : ms > 500 ? "🟡" : "🟢";
        console.log(`${emoji} [${label}] ${name}: ${ms}ms`);
      }
    },
    end: () => {
      if (!isProd) {
        const ms = Math.round(performance.now() - t0);
        const emoji = ms > 2000 ? "🔴" : ms > 500 ? "🟡" : "🟢";
        console.log(`${emoji} [${label}] TOTAL: ${ms}ms`);
      }
    }
  };
}
