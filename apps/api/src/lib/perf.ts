export function timer(label: string) {
  const t0 = Date.now();
  const isProd = process.env.NODE_ENV === "production";
  return {
    step: (name: string) => {
      if (!isProd) {
        console.log(`[${label}] ${name}: ${Date.now() - t0}ms`);
      }
    },
    end: () => {
      const total = Date.now() - t0;
      if (!isProd) {
        const emoji = total > 2000 ? "🔴" : total > 800 ? "🟡" : "🟢";
        console.log(`${emoji} [${label}] TOTAL: ${total}ms`);
      }
      return total;
    }
  };
}
