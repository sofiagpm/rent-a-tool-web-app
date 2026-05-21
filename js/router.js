/* =============================================================
   router.js — router simples por hash
   ----------------------------------------------------------------
   Rotas suportadas:
     #/                          -> home / pesquisa
     #/ferramenta/:id            -> detalhe da ferramenta
     #/registo                   -> criar conta (UC-01)
     #/login                     -> iniciar sessão
     #/meus-alugueres            -> hub do UC-07
     #/aluguer/:id               -> detalhe do aluguer
     #/mensagens                 -> threads de mensagens
     #/mensagens/:threadId       -> thread específica
   ============================================================= */

const Router = (() => {

  // Tabela de rotas. Cada entrada: { pattern: RegExp, render: fn }
  const routes = [];

  function on(pattern, render) {
    routes.push({ pattern, render });
  }

  /** Lê a rota atual a partir do hash. */
  function currentPath() {
    const hash = location.hash || "#/";
    return hash.slice(1) || "/";
  }

  /** Procura a primeira rota que match. */
  function match(path) {
    for (const route of routes) {
      const m = path.match(route.pattern);
      if (m) return { route, params: m.slice(1) };
    }
    return null;
  }

  /** Vai para uma rota nova (programaticamente). */
  function go(path) {
    location.hash = "#" + (path.startsWith("/") ? path : "/" + path);
  }

  /** Resolve a rota corrente: renderiza no #view. */
  function resolve() {
    const path = currentPath();
    const found = match(path);
    const view = document.getElementById("view");

    // Scroll para o topo a cada navegação.
    window.scrollTo({ top: 0, behavior: "instant" });

    if (!found) {
      view.innerHTML = `
        <section class="container">
          <p class="section-eyebrow">Erro 404</p>
          <h1>Página não encontrada</h1>
          <p class="text-muted">O endereço que tentou abrir não existe.</p>
          <a href="#/" class="btn btn--primary">Voltar à pesquisa</a>
        </section>`;
      return;
    }

    try {
      found.route.render(view, ...found.params);
    } catch (err) {
      console.error("[Router] erro a renderizar", err);
      view.innerHTML = `<section class="container"><h1>Algo correu mal</h1><p class="text-muted">${UI.esc(err.message)}</p></section>`;
    }

    // Atualizar a nav com o link ativo
    UI.$$(".nav__link").forEach(el => {
      const r = el.dataset.route;
      const active = (r === "/" && path === "/") ||
                     (r !== "/" && path.startsWith(r));
      el.classList.toggle("is-active", active);
    });
  }

  // Listener global
  window.addEventListener("hashchange", resolve);

  return { on, go, resolve, currentPath };
})();
