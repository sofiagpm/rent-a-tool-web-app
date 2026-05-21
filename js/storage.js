/* =============================================================
   storage.js — abstração sobre LocalStorage
   ----------------------------------------------------------------
   Toda a aplicação acede aos dados através deste módulo, em vez
   de mexer diretamente em window.localStorage. Isto isola a
   estratégia de persistência (podia, no futuro, ser substituída
   por IndexedDB ou por chamadas a um backend) sem alterar o
   resto do código.
   ============================================================= */

const Storage = (() => {
  const NS = "rentatool.v1.";   // namespace + versão

  /** Lê um valor parseado. Devolve `fallback` se a chave não existir. */
  function read(key, fallback = null) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      console.warn("[Storage] falha a ler", key, err);
      return fallback;
    }
  }

  /** Escreve um valor (serializado em JSON). */
  function write(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error("[Storage] falha a gravar", key, err);
      return false;
    }
  }

  /** Apaga uma chave. */
  function remove(key) {
    localStorage.removeItem(NS + key);
  }

  /** Apaga TUDO o que pertence à app (mantém o resto). */
  function clearAll() {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  }

  /** Gera um id curto e único o suficiente para a demo. */
  function uid(prefix = "id") {
    return prefix + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  }

  return { read, write, remove, clearAll, uid, NS };
})();
