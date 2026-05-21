/* =============================================================
   catalog.js — UC-03 (pesquisar) e UC-05 (solicitar reserva)
   ============================================================= */

const Catalog = (() => {

  /** Lê todas as ferramentas. */
  function all() {
    return Storage.read("tools", []);
  }

  /** Procura uma ferramenta pelo id. */
  function byId(id) {
    return all().find(t => t.id === id) || null;
  }

  /** Lista os anúncios do utilizador atualmente em sessão. */
  function ofOwner(ownerId) {
    return all().filter(t => t.ownerId === ownerId);
  }

  /**
   * UC-03: pesquisa o catálogo aplicando os filtros indicados.
   * Quaisquer filtros omissos são ignorados (degradação graciosa).
   *
   * @param {Object} f - { q, category, city, priceMax, startDate, endDate, sort }
   */
  function search(f = {}) {
    let list = all();

    if (f.q) {
      const needle = f.q.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(needle) ||
        (t.description || "").toLowerCase().includes(needle)
      );
    }

    if (f.category && f.category !== "todas") {
      list = list.filter(t => t.category === f.category);
    }

    if (f.city && f.city !== "Todas") {
      list = list.filter(t => t.city === f.city);
    }

    if (f.priceMax) {
      const max = parseFloat(f.priceMax);
      if (!isNaN(max)) list = list.filter(t => t.pricePerDay <= max);
    }

    // Disponibilidade no intervalo: exclui ferramentas com alugueres
    // sobrepostos (em estados que ocupam o slot).
    if (f.startDate && f.endDate) {
      const rentals = Storage.read("rentals", []);
      const occupiedStates = ["CONFIRMADO", "ATIVO"];
      list = list.filter(t => {
        const conflicts = rentals.some(r =>
          r.toolId === t.id &&
          occupiedStates.includes(r.state) &&
          overlap(r.startDate, r.endDate, f.startDate, f.endDate)
        );
        return !conflicts;
      });
    }

    // Ordenação
    const sort = f.sort || "recent";
    if (sort === "price-asc") list.sort((a,b) => a.pricePerDay - b.pricePerDay);
    else if (sort === "price-desc") list.sort((a,b) => b.pricePerDay - a.pricePerDay);
    else if (sort === "rating") list.sort((a,b) => ratingOf(b.ownerId) - ratingOf(a.ownerId));
    // "recent" = ordem natural

    return list;
  }

  function ratingOf(userId) {
    const u = (Storage.read("users", []) || []).find(x => x.id === userId);
    return u ? u.rating || 0 : 0;
  }

  /** Verifica se dois intervalos (ISO yyyy-mm-dd) se sobrepõem. */
  function overlap(a1, a2, b1, b2) {
    return !(a2 < b1 || b2 < a1);
  }

  /** Verifica disponibilidade de uma ferramenta num dado intervalo. */
  function isAvailable(toolId, startDate, endDate) {
    const rentals = Storage.read("rentals", []);
    const occupied = ["CONFIRMADO", "ATIVO"];
    return !rentals.some(r =>
      r.toolId === toolId &&
      occupied.includes(r.state) &&
      overlap(r.startDate, r.endDate, startDate, endDate)
    );
  }

  /**
   * UC-05: solicitar reserva.
   * @returns {Object} { ok: true, rental } | { ok: false, error }
   *
   * Regras aplicadas:
   *  - utilizador autenticado (BR-01)
   *  - KYC validado / Trusted Badge ativo (BR-01)
   *  - ferramenta disponível no intervalo (E2)
   *  - cativação prévia (simulada) — BR-02
   */
  function requestReservation({ toolId, startDate, endDate, paymentMethod }) {
    const me = Auth.current();
    if (!me) return { ok: false, error: "É preciso iniciar sessão para reservar." };
    if (!me.trustedBadge) return { ok: false, error: "A sua verificação de identidade (KYC) ainda não foi validada." };

    const tool = byId(toolId);
    if (!tool) return { ok: false, error: "Ferramenta não encontrada." };

    if (tool.ownerId === me.id) return { ok: false, error: "Não pode reservar uma ferramenta sua." };

    if (!startDate || !endDate) return { ok: false, error: "Indique as datas de início e fim." };
    if (endDate < startDate) return { ok: false, error: "A data de fim não pode ser anterior à de início." };
    if (startDate < UI.todayISO()) return { ok: false, error: "A data de início não pode ser no passado." };

    if (!isAvailable(toolId, startDate, endDate)) {
      return { ok: false, error: "A ferramenta já está reservada nessas datas." };
    }

    // Simulação da cativação Stripe — assumimos sucesso para a demo.
    const days = UI.daysBetween(startDate, endDate);
    const rentalCost = days * tool.pricePerDay;
    const serviceFee = +(rentalCost * 0.07).toFixed(2);  // 7% taxa de serviço

    const rental = {
      id: Storage.uid("rt"),
      toolId,
      toolTitle: tool.title,
      ownerId: tool.ownerId,
      renterId: me.id,
      startDate,
      endDate,
      days,
      rentalCost,
      serviceFee,
      deposit: tool.deposit,
      totalCaptured: rentalCost + serviceFee + tool.deposit,
      paymentMethod: paymentMethod || "card",
      paymentState: "CAPTURED",       // BR-02
      state: "CONFIRMADO",            // pendente de levantamento (UC-06)
      createdAt: new Date().toISOString(),
      timeline: [
        { state: "CONFIRMADO", at: new Date().toISOString(), label: "Reserva confirmada e caução cativada" }
      ],
      checkin: null,
      checkout: null,
      reviewByRenter: null,
      reviewByOwner: null,
      reports: []
    };

    const rentals = Storage.read("rentals", []);
    rentals.push(rental);
    Storage.write("rentals", rentals);

    return { ok: true, rental };
  }

  return { all, byId, ofOwner, search, isAvailable, requestReservation };
})();
