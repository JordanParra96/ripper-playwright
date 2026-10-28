import { test } from "@playwright/test";
import { Ripper } from "../src/Ripper.js";

test.describe("Systematic Exploration", () => {
  test("Debe mapear la aplicación completa (BFS) post-login", async ({
    page,
    baseURL,
  }) => {
    // Una exploración tarda más que una prueba normal
    test.setTimeout(180000);

    const ripper = new Ripper(page, baseURL);

    // 1. Iniciar sesión para explorar la zona privada
    await ripper.login();

    // 2. Explorar
    await ripper.start();
  });
});
