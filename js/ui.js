/* =============================================================
   ui.js — utilitários partilhados de interface
   ============================================================= */

const UI = (() => {

  /** Escapa HTML em strings — protege contra XSS quando se insere user input. */
  function esc(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Formata um valor em euros. */
  function money(n) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
  }

  /** Converte uma string ISO (data) numa apresentação curta dd/mm/yyyy. */
  function dateShort(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("pt-PT");
  }

  /** Data + hora curtas. */
  function dateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  /** "há 3 min", "há 2 dias"... */
  function timeAgo(iso) {
    if (!iso) return "";
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "agora mesmo";
    if (diff < 3600) return `há ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff/3600)} h`;
    if (diff < 86400*7) return `há ${Math.floor(diff/86400)} d`;
    return dateShort(iso);
  }

  /** Diferença em dias inclusivos entre dois ISO (yyyy-mm-dd). */
  function daysBetween(startISO, endISO) {
    const s = new Date(startISO), e = new Date(endISO);
    const ms = e.getTime() - s.getTime();
    return Math.max(1, Math.round(ms / (1000*60*60*24)) + 1);
  }

  /** Hoje, formato ISO yyyy-mm-dd (para inputs <input type="date">). */
  function todayISO(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0,10);
  }

  /** Iniciais (2 letras) a partir de um nome. */
  function initials(name) {
    if (!name) return "??";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  }

  /** Estrelas (apresentação textual). */
  function starsHTML(rating) {
    const r = Math.round(rating || 0);
    const full = "★".repeat(r);
    const empty = `<span class="stars__empty">${"★".repeat(5 - r)}</span>`;
    return `<span class="stars">${full}${empty}</span>`;
  }

  // ============================================================
  // TOASTS
  // ============================================================
  function toast(message, type = "info", duration = 3500) {
    const host = document.getElementById("toasts");
    if (!host) return;
    const el = document.createElement("div");
    el.className = "toast" + (type === "good" ? " toast--good" : type === "bad" ? " toast--bad" : type === "warn" ? " toast--warn" : "");
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .25s ease, transform .25s ease";
      el.style.opacity = "0";
      el.style.transform = "translateX(40px)";
      setTimeout(() => el.remove(), 260);
    }, duration);
  }

  // ============================================================
  // MODAL
  // ============================================================
  let modalResolver = null;

  function openModal({ title, body, foot } = {}) {
    const modal = document.getElementById("modal");
    document.getElementById("modalTitle").textContent = title || "";
    document.getElementById("modalBody").innerHTML = body || "";
    document.getElementById("modalFoot").innerHTML = foot || "";
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    return new Promise(resolve => { modalResolver = resolve; });
  }

  function closeModal(result = null) {
    document.getElementById("modal").hidden = true;
    document.body.style.overflow = "";
    if (modalResolver) { const r = modalResolver; modalResolver = null; r(result); }
  }

  // Listeners únicos para o modal
  document.addEventListener("click", e => {
    if (e.target.matches("[data-close-modal]")) closeModal(null);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !document.getElementById("modal").hidden) closeModal(null);
  });

  // ============================================================
  // Reset de dados (botão no rodapé)
  // ============================================================
  document.addEventListener("click", async (e) => {
    if (e.target.id === "resetDataBtn") {
      const ok = await confirm({
        title: "Repor dados de demonstração?",
        message: "Esta ação apaga todos os utilizadores, ferramentas e alugueres que criou, e volta a carregar o catálogo de demonstração."
      });
      if (ok) {
        Seed.resetAndSeed();
        toast("Dados de demonstração repostos.", "good");
        setTimeout(() => location.hash = "#/", 200);
        setTimeout(() => location.reload(), 600);
      }
    }
  });

  /** Confirmação modal simples (devolve Promise<bool>). */
  function confirm({ title = "Confirmar", message = "", okLabel = "Confirmar", cancelLabel = "Cancelar", danger = false } = {}) {
    openModal({
      title,
      body: `<p>${esc(message)}</p>`,
      foot: `
        <button class="btn btn--ghost" data-confirm="cancel">${esc(cancelLabel)}</button>
        <button class="btn ${danger ? "btn--danger" : "btn--primary"}" data-confirm="ok">${esc(okLabel)}</button>
      `
    });
    return new Promise(resolve => {
      const handler = (e) => {
        const choice = e.target.closest("[data-confirm]")?.dataset.confirm;
        if (!choice) return;
        document.removeEventListener("click", handler);
        closeModal();
        resolve(choice === "ok");
      };
      document.addEventListener("click", handler);
    });
  }

  // ============================================================
  // QUERY/RENDER helpers
  // ============================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function render(target, html) {
    const el = (typeof target === "string") ? document.querySelector(target) : target;
    if (el) el.innerHTML = html;
  }

  return {
    esc, money, dateShort, dateTime, timeAgo, daysBetween, todayISO,
    initials, starsHTML,
    toast, openModal, closeModal, confirm,
    $, $$, render
  };
})();
