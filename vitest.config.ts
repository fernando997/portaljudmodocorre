import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Config isolada da build principal (vite.config.ts usa o wrapper da Lovable,
// que não deve ser reaproveitado aqui) — só o necessário pra rodar testes.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
