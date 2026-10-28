import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // Un ripper es secuencial: mantiene su propio estado (la cola y el grafo)
  fullyParallel: false,
  reporter: "html",
  use: {
    // URL base de Swag Labs
    baseURL: "https://www.saucedemo.com",
    // Artefactos de depuración solo si la prueba falla
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
