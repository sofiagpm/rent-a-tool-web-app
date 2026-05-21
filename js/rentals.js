/* =============================================================
   rentals.js — UC-06, UC-07, UC-08, UC-09, UC-10
   ============================================================= */

const Rentals = (() => {

  /** Lê todos os alugueres em que o utilizador atual é parte. */
  function ofCurrent() {
    const me = Auth.current();
    if (!me) return [];
    const all = Storage.read("rentals", []);
    return all.filter(r => r.renterId === me.id || r.ownerId === me.id);
  }

  function byId(id) {
    return (Storage.read("rentals", []) || []).find(r => r.id === id) || null;
  }

  function persist(rental) {
    const all = Storage.read("rentals", []);
    const idx = all.findIndex(r => r.id === rental.id);
    if (idx >= 0) all[idx] = rental;
    else all.push(rental);
    Storage.write("rentals", all);
  }

  /** Agrupa pelos buckets do UC-07: ATIVOS / PRÓXIMOS / HISTÓRICO / EM_DISPUTA. */
  function groupForUser() {
    const rs = ofCurrent();
    return {
      ATIVOS:     rs.filter(r => r.state === "ATIVO"),
      PROXIMOS:   rs.filter(r => r.state === "CONFIRMADO" || r.state === "PENDENTE"),
      HISTORICO:  rs.filter(r => r.state === "FINALIZADO" || r.state === "CANCELADO"),
      EM_DISPUTA: rs.filter(r => r.state === "EM_DISPUTA")
    };
  }

  /** Retorna o papel do utilizador atual neste aluguer ("renter" / "owner" / null). */
  function roleOf(rental) {
    const me = Auth.current();
    if (!me || !rental) return null;
    if (rental.renterId === me.id) return "renter";
    if (rental.ownerId === me.id) return "owner";
    return null;
  }

  /** Texto humano para um estado. */
  function stateLabel(state) {
    return {
      "CONFIRMADO":  "Confirmado",
      "PENDENTE":    "Pendente",
      "ATIVO":       "Em curso",
      "FINALIZADO":  "Finalizado",
      "EM_DISPUTA":  "Em disputa",
      "CANCELADO":   "Cancelado"
    }[state] || state;
  }

  /** Classe do badge consoante o estado. */
  function stateBadgeClass(state) {
    return {
      "CONFIRMADO":  "badge--accent",
      "PENDENTE":    "badge--warn",
      "ATIVO":       "badge--good",
      "FINALIZADO":  "badge--info",
      "EM_DISPUTA":  "badge--bad",
      "CANCELADO":   "badge--bad"
    }[state] || "";
  }

  // ------------------------------------------------------------
  // UC-06 — Check-in
  // ------------------------------------------------------------
  // Fluxo simplificado: ambas as partes confirmam digitalmente.
  // O proprietário confirma, depois o arrendatário confirma e o
  // estado transita para ATIVO. Para a iteração, basta clicar
  // "Confirmar check-in" — registamos o utilizador que confirmou
  // e quando ambos confirmarem, o aluguer fica ATIVO.
  function checkIn({ rentalId, notes }) {
    const r = byId(rentalId);
    if (!r) return { ok: false, error: "Aluguer não encontrado." };
    if (r.state !== "CONFIRMADO" && r.state !== "PENDENTE") {
      return { ok: false, error: "Este aluguer não está em estado de check-in." };
    }
    const role = roleOf(r);
    if (!role) return { ok: false, error: "Acesso não autorizado." };

    r.checkin = r.checkin || { ownerConfirmed: false, renterConfirmed: false, notes: "", photos: 3, at: null };
    if (role === "owner")  r.checkin.ownerConfirmed = true;
    if (role === "renter") r.checkin.renterConfirmed = true;
    if (notes) r.checkin.notes = notes;
    r.checkin.at = new Date().toISOString();

    if (r.checkin.ownerConfirmed && r.checkin.renterConfirmed) {
      r.state = "ATIVO";
      r.timeline.push({ state: "ATIVO", at: new Date().toISOString(),
        label: "Check-in concluído por ambas as partes — aluguer ativo" });
    } else {
      r.timeline.push({ state: r.state, at: new Date().toISOString(),
        label: `Check-in confirmado pelo ${role === "owner" ? "proprietário" : "arrendatário"} — aguarda a contraparte` });
    }

    persist(r);
    return { ok: true, rental: r };
  }

  // ------------------------------------------------------------
  // UC-08 — Check-out (devolução)
  // ------------------------------------------------------------
  // O proprietário confirma a devolução. Se "Sem ocorrências", o
  // aluguer fica FINALIZADO, libertando-se a caução (simulado).
  // Se "Com ocorrências", abrimos automaticamente um sinistro
  // (UC-10) e o estado passa a EM_DISPUTA.
  function checkOut({ rentalId, hasIssues, notes }) {
    const r = byId(rentalId);
    if (!r) return { ok: false, error: "Aluguer não encontrado." };
    if (r.state !== "ATIVO") return { ok: false, error: "O aluguer não está ATIVO." };
    if (roleOf(r) !== "owner") {
      return { ok: false, error: "Apenas o proprietário pode confirmar a devolução." };
    }

    r.checkout = {
      at: new Date().toISOString(),
      hasIssues: !!hasIssues,
      notes: notes || "",
      photos: 3
    };

    if (hasIssues) {
      r.state = "EM_DISPUTA";
      r.timeline.push({ state: "EM_DISPUTA", at: r.checkout.at,
        label: "Devolução com ocorrências reportadas — aluguer em disputa" });
      // Cria um relatório de sinistro associado
      const reports = Storage.read("reports", []);
      reports.push({
        id: Storage.uid("rep"),
        rentalId: r.id,
        type: "DANO",
        notes: notes || "",
        reporterId: Auth.current()?.id,
        createdAt: r.checkout.at,
        state: "PENDENTE_ANALISE"
      });
      Storage.write("reports", reports);
    } else {
      r.state = "FINALIZADO";
      r.paymentState = "RELEASED";
      r.timeline.push({ state: "FINALIZADO", at: r.checkout.at,
        label: "Devolução confirmada — pagamento ao proprietário e caução libertada" });
    }

    persist(r);
    return { ok: true, rental: r };
  }

  // ------------------------------------------------------------
  // UC-09 — Avaliar experiência
  // ------------------------------------------------------------
  // Implementação simplificada: cada parte submete a sua avaliação.
  // Quando ambas submetem (ou quando passam 14 dias), tornam-se
  // públicas e a média do avaliado é recalculada.
  function review({ rentalId, stars, comment }) {
    const r = byId(rentalId);
    if (!r) return { ok: false, error: "Aluguer não encontrado." };
    if (r.state !== "FINALIZADO") return { ok: false, error: "Só é possível avaliar alugueres finalizados." };
    if (!stars || stars < 1 || stars > 5) return { ok: false, error: "Indique uma classificação entre 1 e 5." };

    const role = roleOf(r);
    if (!role) return { ok: false, error: "Acesso não autorizado." };

    const at = new Date().toISOString();
    if (role === "renter") {
      if (r.reviewByRenter) return { ok: false, error: "Já submeteu uma avaliação para este aluguer." };
      r.reviewByRenter = { stars, comment: (comment || "").slice(0, 500), at, hidden: !r.reviewByOwner };
    } else {
      if (r.reviewByOwner) return { ok: false, error: "Já submeteu uma avaliação para este aluguer." };
      r.reviewByOwner = { stars, comment: (comment || "").slice(0, 500), at, hidden: !r.reviewByRenter };
    }

    // Quando ambas existem, publicam-se e atualiza-se a média do avaliado.
    if (r.reviewByRenter && r.reviewByOwner) {
      r.reviewByRenter.hidden = false;
      r.reviewByOwner.hidden = false;
      updateUserRating(r.ownerId,  r.reviewByRenter.stars);
      updateUserRating(r.renterId, r.reviewByOwner.stars);
    }

    r.timeline.push({ state: r.state, at, label: `Avaliação submetida pelo ${role === "owner" ? "proprietário" : "arrendatário"}` });
    persist(r);
    return { ok: true, rental: r };
  }

  function updateUserRating(userId, newStars) {
    const users = Storage.read("users", []);
    const idx = users.findIndex(u => u.id === userId);
    if (idx < 0) return;
    const u = users[idx];
    const oldCount = u.ratingCount || 0;
    const oldRating = u.rating || 0;
    const newCount = oldCount + 1;
    const newRating = +((oldRating * oldCount + newStars) / newCount).toFixed(2);
    u.ratingCount = newCount;
    u.rating = newRating;
    users[idx] = u;
    Storage.write("users", users);
  }

  // ------------------------------------------------------------
  // UC-10 — Reportar problema
  // ------------------------------------------------------------
  function report({ rentalId, type, notes }) {
    const r = byId(rentalId);
    if (!r) return { ok: false, error: "Aluguer não encontrado." };
    const me = Auth.current();
    if (!me || roleOf(r) === null) return { ok: false, error: "Acesso não autorizado." };

    const reports = Storage.read("reports", []);
    const rep = {
      id: Storage.uid("rep"),
      rentalId: r.id,
      type: type || "OUTRO",     // DANO | ATRASO | FURTO | OUTRO
      notes: (notes || "").slice(0, 800),
      reporterId: me.id,
      createdAt: new Date().toISOString(),
      state: "PENDENTE_ANALISE"
    };
    reports.push(rep);
    Storage.write("reports", reports);

    r.reports = r.reports || [];
    r.reports.push(rep.id);
    if (r.state === "ATIVO" || r.state === "CONFIRMADO") {
      r.state = "EM_DISPUTA";
      r.timeline.push({ state: "EM_DISPUTA", at: rep.createdAt,
        label: `Problema reportado (${rep.type}) — aluguer em disputa` });
    } else {
      r.timeline.push({ state: r.state, at: rep.createdAt,
        label: `Problema reportado (${rep.type})` });
    }
    persist(r);
    return { ok: true, report: rep };
  }

  return {
    ofCurrent, byId, groupForUser, roleOf, stateLabel, stateBadgeClass,
    checkIn, checkOut, review, report
  };
})();
