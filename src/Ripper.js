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

  /** Visita una URL. En los siguientes pasos también descubrirá sus transiciones. */
  async visitAndExtract(url) {
    // Se marca como visitada antes de ir, para no volver a agregarla a la cola
    this.visitedUrls.add(url);

    try {
      console.log(`Visitando: ${url}`);
      await this.page.goto(url, { waitUntil: "domcontentloaded" });
    } catch (error) {
      console.error(`Error visitando ${url}: ${error.message}`);
    }
  }

  report() {
    console.log("--- FIN DE LA EXPLORACIÓN ---");
    console.log(`Nodos visitados: ${this.visitedUrls.size}`);
  }
}
