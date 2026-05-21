/* =============================================================
   messages.js — UC-04 (Contactar o proprietário)
   ----------------------------------------------------------------
   Estrutura: cada "thread" é uma conversa entre dois utilizadores
   acerca de uma ferramenta. Aplica-se BR-08 (Anti-bypass de
   Comunicação) — bloqueio de partilha de contactos externos.
   ============================================================= */

const Messages = (() => {

  // Regex para detetar telefone, email ou URL nas mensagens.
  // Conservadora para a demo — sinaliza, e o sistema avisa o utilizador.
  const RE_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const RE_PHONE = /(\+?\d[\d\s-]{7,}\d)/;
  const RE_URL = /\b(https?:\/\/|www\.)\S+/i;

  /** Devolve todas as threads do utilizador atual. */
  function ofCurrent() {
    const me = Auth.current();
    if (!me) return [];
    return (Storage.read("messages", []) || [])
      .filter(t => t.userA === me.id || t.userB === me.id)
      .sort((a,b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  /** Procura uma thread por id. */
  function byId(id) {
    return (Storage.read("messages", []) || []).find(t => t.id === id) || null;
  }

  /**
   * Garante a existência de uma thread entre o utilizador atual e o
   * proprietário da ferramenta indicada. Devolve a thread.
   */
  function ensureThread({ toolId, ownerId }) {
    const me = Auth.current();
    if (!me) return null;
    if (me.id === ownerId) return null;

    const all = Storage.read("messages", []) || [];
    let t = all.find(x => x.toolId === toolId &&
                          ((x.userA === me.id && x.userB === ownerId) ||
                           (x.userA === ownerId && x.userB === me.id)));
    if (!t) {
      t = {
        id: Storage.uid("th"),
        toolId,
        userA: me.id,
        userB: ownerId,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      all.push(t);
      Storage.write("messages", all);
    }
    return t;
  }

  /** Envia uma mensagem na thread indicada. Devolve { ok, message?, warning? }. */
  function send({ threadId, text }) {
    const me = Auth.current();
    if (!me) return { ok: false, error: "É preciso iniciar sessão." };
    const t = byId(threadId);
    if (!t) return { ok: false, error: "Conversa não encontrada." };
    if (t.userA !== me.id && t.userB !== me.id) return { ok: false, error: "Acesso não autorizado." };
    if (!text || !text.trim()) return { ok: false, error: "Escreva uma mensagem." };

    // BR-08 — Anti-bypass de Comunicação: detetar partilha de contactos.
    let warning = null;
    let masked = text;
    if (RE_EMAIL.test(text) || RE_PHONE.test(text) || RE_URL.test(text)) {
      masked = text
        .replace(RE_EMAIL, "[email removido]")
        .replace(RE_PHONE, "[contacto removido]")
        .replace(RE_URL,   "[link removido]");
      warning = "Para sua segurança, a partilha de contactos externos é bloqueada (BR-08).";
    }

    const msg = {
      id: Storage.uid("m"),
      from: me.id,
      text: masked,
      at: new Date().toISOString()
    };

    // Persistir
    const all = Storage.read("messages", []);
    const idx = all.findIndex(x => x.id === t.id);
    if (idx >= 0) {
      all[idx].messages.push(msg);
      all[idx].updatedAt = msg.at;
      Storage.write("messages", all);
    }

    return { ok: true, message: msg, warning };
  }

  /** Devolve o "outro" utilizador da thread (relativo ao utilizador em sessão). */
  function counterpart(thread) {
    const me = Auth.current();
    if (!me || !thread) return null;
    const otherId = thread.userA === me.id ? thread.userB : thread.userA;
    return (Storage.read("users", []) || []).find(u => u.id === otherId) || null;
  }

  return { ofCurrent, byId, ensureThread, send, counterpart };
})();
