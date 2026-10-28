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

  /** Visita una URL y descubre sus transiciones. */
  async visitAndExtract(url) {
    // Se marca como visitada antes de ir, para no volver a agregarla a la cola
    this.visitedUrls.add(url);

    try {
      console.log(`Visitando: ${url}`);
      await this.page.goto(url, { waitUntil: "networkidle" });

      // Extracción estática (enlaces con href)
      const staticLinks = await this.extractLinks();
      this.processLinks(url, staticLinks);
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

  report() {
    console.log("--- FIN DE LA EXPLORACIÓN ---");
    console.log(`Nodos visitados: ${this.visitedUrls.size}`);
  }
}
