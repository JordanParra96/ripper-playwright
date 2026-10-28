import fs from "fs";
import path from "path";
// Elementos que la exploración dinámica prueba con "clic y volver". Para el tutorial se limitan a
// los de Swag Labs; en otra aplicación se usarían selectores más genéricos, como 'a[href="#"], button'.
const DYNAMIC_SELECTOR = [
  ".inventory_item_name",
  ".inventory_item_img a",
  ".shopping_cart_link",
  '[data-test="back-to-products"]',
  '[data-test="checkout"]',
  '[data-test="continue"]',
  '[data-test="finish"]',
].join(", ");
/**
 * El cartógrafo: navega, cataloga y reporta los estados de la aplicación.
 */
export class Ripper {
  constructor(page, baseUrl) {
    this.page = page; // la página de Playwright
    this.baseUrl = baseUrl;

    // Memoria: URL ya visitadas (un Set permite consultas rápidas)
    this.visitedUrls = new Set();
    // Cola de URL descubiertas y pendientes por visitar (FIFO)
    this.queue = [];
    // Grafo: { url_origen: [url_destino_1, url_destino_2] }
    this.adjacencyList = new Map();
    // Límite de seguridad: cantidad máxima de nodos que se visitan
    this.maxNodes = 15;
  }

  /** Inicia sesión para explorar la zona privada de la aplicación. */
  async login() {
    console.log("Iniciando sesión para acceder al sistema...");
    await this.page.goto(this.baseUrl);
    await this.page.fill('[data-test="username"]', "standard_user");
    await this.page.fill('[data-test="password"]', "secret_sauce");
    await this.page.click('[data-test="login-button"]');
    await this.page.waitForURL("**/inventory.html");
    console.log("Login exitoso. Comenzando exploración.");

    // La exploración empieza desde la página que se abre después de iniciar sesión
    this.queue = [this.page.url()];
    this.visitedUrls.clear();
  }

  /** Exploración en anchura (BFS). */
  async start() {
    console.log(`Iniciando exploración en: ${this.baseUrl}`);
    if (this.queue.length === 0) this.queue.push(this.baseUrl);

    while (this.queue.length > 0 && this.visitedUrls.size < this.maxNodes) {
      const currentUrl = this.queue.shift();
      if (this.visitedUrls.has(currentUrl)) continue;
      await this.visitAndExtract(currentUrl);
    }

    this.report();
  }

  /** Visita una URL, la fotografía y descubre sus transiciones. */
  async visitAndExtract(url) {
    // Se marca como visitada antes de ir, para no volver a agregarla a la cola
    this.visitedUrls.add(url);

    try {
      console.log(`Visitando: ${url}`);
      await this.page.goto(url, { waitUntil: "networkidle" });

      // Fotografía del estado
      const nodeId = this.sanitizeNode(url);
      fs.mkdirSync("ripper_artifacts", { recursive: true });
      await this.page.screenshot({
        path: path.join("ripper_artifacts", `${nodeId}.png`),
        fullPage: true,
      });

      // Fase 1: extracción estática (enlaces con href)
      const staticLinks = await this.extractLinks();
      this.processLinks(url, staticLinks);

      // Fase 2: exploración dinámica, solo en las páginas donde vale la pena
      const isExplorable =
        url.includes("inventory.html") ||
        url.includes("cart.html") ||
        url.includes("checkout-step-one.html") ||
        url.includes("checkout-step-two.html");

      if (isExplorable) {
        await this.exploreDynamicLinks(url);
      }
    } catch (error) {
      console.error(`Error procesando ${url}: ${error.message}`);
    }
  }

  /** Extrae los href válidos de la página, ejecutando el código dentro del navegador. */
  async extractLinks() {
    return await this.page.evaluate((baseUrl) => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      return (
        anchors
          // El navegador entrega la URL absoluta; sin el fragmento (#...), que no cambia de página
          .map((a) => a.href.split("#")[0])
          .filter((href) => {
            // Solo el dominio de la aplicación
            if (!href.startsWith(baseUrl)) return false;
            // Sin javascript: ni la página inicial (la de inicio de sesión)
            if (href.includes("javascript:") || href === baseUrl + "/")
              return false;
            // Sin archivos estáticos
            if (href.endsWith(".pdf") || href.endsWith(".png")) return false;
            return true;
          })
          // Sin duplicados
          .filter((value, index, self) => self.indexOf(value) === index)
      );
    }, this.baseUrl);
  }

  /**
   * Descubre estados que no aparecen como enlaces: hace clic en cada candidato, observa si la URL
   * cambió y vuelve atrás (clic y volver).
   */
  async exploreDynamicLinks(currentUrl) {
    console.log("   Iniciando exploración dinámica (clic y volver)...");
    const total = (await this.page.$$(DYNAMIC_SELECTOR)).length;
    console.log(
      `   -> Detectados ${total} elementos interactivos para probar.`,
    );

    for (let i = 0; i < total; i++) {
      try {
        // Se buscan de nuevo en cada vuelta: al volver atrás, la página se reconstruye
        const element = (await this.page.$$(DYNAMIC_SELECTOR))[i];
        if (!element) continue;

        await element.click();
        // Tiempo para que la aplicación reaccione
        await this.page.waitForTimeout(800);

        const newUrl = this.page.url();
        if (newUrl !== currentUrl) {
          console.log(`   ¡Descubrimiento! El clic llevó a: ${newUrl}`);
          if (!this.visitedUrls.has(newUrl) && !this.queue.includes(newUrl)) {
            this.queue.push(newUrl);
            this.addEdge(currentUrl, newUrl);
          }
          // Volver para probar el siguiente candidato
          await this.page.goBack();
          await this.page.waitForLoadState("domcontentloaded");
        }
      } catch (error) {
        console.log(
          `   Fallo explorando el elemento ${i}: ${error.message.split("\n")[0]}`,
        );
        if (this.page.url() !== currentUrl) {
          await this.page.goto(currentUrl);
        }
      }
    }
  }

  /** Convierte una URL en un identificador corto: ".../inventory.html" -> "inventory". */
  sanitizeNode(url) {
    try {
      const urlObj = new URL(url);
      let name = urlObj.pathname.replace("/", "").replace(".html", "");
      if (name === "" || name === "/") name = "Home";
      if (urlObj.search) {
        name += `_${urlObj.searchParams.toString()}`;
      }
      return name.replace(/[^a-zA-Z0-9_]/g, "_");
    } catch {
      return "Unknown_Node";
    }
  }

  /** Agrega a la cola y al grafo los enlaces que no se conocían. */
  processLinks(sourceUrl, links) {
    console.log(`   -> Encontrados ${links.length} enlaces estáticos.`);
    for (const link of links) {
      if (!this.visitedUrls.has(link) && !this.queue.includes(link)) {
        this.queue.push(link);
        this.addEdge(sourceUrl, link);
      }
    }
  }

  addEdge(sourceUrl, destinationUrl) {
    if (!this.adjacencyList.has(sourceUrl)) {
      this.adjacencyList.set(sourceUrl, []);
    }
    this.adjacencyList.get(sourceUrl).push(destinationUrl);
  }

  /** Escribe el grafo en formato Mermaid y el reporte de salud. */
  report() {
    console.log("--- GENERANDO ARTEFACTOS ---");
    fs.mkdirSync("ripper_artifacts", { recursive: true });

    let mermaidContent = "graph TD;\n";
    this.adjacencyList.forEach((destinations, source) => {
      const sourceId = this.sanitizeNode(source);
      destinations.forEach((dest) => {
        const destId = this.sanitizeNode(dest);
        if (sourceId !== destId) {
          mermaidContent += `  ${sourceId} --> ${destId};\n`;
        }
      });
    });

    const graphPath = path.join("ripper_artifacts", "graph.mermaid");
    fs.writeFileSync(graphPath, mermaidContent);
    console.log(`Grafo generado en: ${graphPath}`);
    console.log(`Total de nodos: ${this.visitedUrls.size}`);
  }
}
