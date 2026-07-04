export function browserTimer(label: string) {
  const t0 = performance.now();
  const isDev = process.env.NODE_ENV === "development";
  return {
    step: (name: string) => {
      if (isDev) {
        const ms = Math.round(performance.now() - t0);
        console.log(`[${label}] ${name}: ${ms}ms`);
      }
    },
    end: () => {
      if (isDev) {
        const ms = Math.round(performance.now() - t0);
        console.log(`[${label}] TOTAL: ${ms}ms`);
      }
    }
  };
}
