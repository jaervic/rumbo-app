import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Configuración de Vitest.
 *
 * El motor de precios (`lib/pricing.ts`) es puro y sin red, así que corre en entorno `node` (no hace
 * falta DOM). El alias `@` replica el `paths` de tsconfig para que los imports `@/...` de los
 * módulos bajo prueba se resuelvan igual que en Next.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
