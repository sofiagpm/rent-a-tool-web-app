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
  // UC-06 — Check-in (US6.1) — com Código de Pairing
  // ------------------------------------------------------------
  // Fluxo fiel ao backlog:
  //   Regra 1: o PROPRIETÁRIO carrega ≥ 3 fotografias de evidência
  //            e GERA um Código de Pairing de uso único.
  //   Regra 2: o código tem validade de 15 minutos.
  //   Regra 3: o ARRENDATÁRIO insere o código no seu dispositivo.
  //   Regra 4: o estado só transita para ATIVO após a sincronização
  //            bilateral (proprietário gera + arrendatário valida).
  //   Regra 5 (BR-05, janela de 2h): documentada; nesta demo não
  //            bloqueamos por hora agendada por não termos agendamento
  //            de hora, apenas datas.

  const PAIRING_TTL_MIN = 15;          // validade do código (minutos)
  const MIN_CHECKIN_PHOTOS = 3;        // Regra 1 — evidência fotográfica

  /** Gera um código de pairing de 6 dígitos. */
  function genPairingCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * Passo do PROPRIETÁRIO: regista evidências (≥3 fotos) e gera o
   * código de pairing de uso único, válido por 15 minutos.
   */
  function generatePairing({ rentalId, photos, notes }) {
    const r = byId(rentalId);
    if (!r) return { ok: false, error: "Aluguer não encontrado." };
    if (r.state !== "CONFIRMADO" && r.state !== "PENDENTE") {
      return { ok: false, error: "Este aluguer não está em estado de check-in." };
    }
    if (roleOf(r) !== "owner") {
      return { ok: false, error: "Apenas o proprietário gera o código de levantamento." };
    }
    const nPhotos = Number(photos) || 0;
    if (nPhotos < MIN_CHECKIN_PHOTOS) {
      return { ok: false, error: `É obrigatório registar pelo menos ${MIN_CHECKIN_PHOTOS} fotografias (Regra 1).` };
    }

    const now = Date.now();
    const code = genPairingCode();
    r.checkin = {
      ownerConfirmed: true,
      renterConfirmed: false,
      photos: nPhotos,
      notes: notes || "",
      code,
      codeIssuedAt: new Date(now).toISOString(),
      codeExpiresAt: new Date(now + PAIRING_TTL_MIN * 60000).toISOString(),
      at: null
    };
    r.timeline.push({ state: r.state, at: new Date(now).toISOString(),
      label: `Proprietário registou evidências e gerou o código de levantamento (válido ${PAIRING_TTL_MIN} min)` });

    persist(r);
    return { ok: true, rental: r, code, expiresAt: r.checkin.codeExpiresAt };
  }

  /**
   * Passo do ARRENDATÁRIO: insere o código recebido. Se for válido e
   * estiver dentro da janela de 15 min, sincroniza e o aluguer fica ATIVO.
   */
  function validatePairing({ rentalId, code }) {
    const r = byId(rentalId);
    if (!r) return { ok: false, error: "Aluguer não encontrado." };
    if (roleOf(r) !== "renter") {
      return { ok: false, error: "Apenas o arrendatário valida o código." };
    }
    if (!r.checkin || !r.checkin.code) {
      return { ok: false, error: "O proprietário ainda não gerou o código de levantamento." };
    }
    if (r.checkin.renterConfirmed) {
      return { ok: false, error: "Este levantamento já foi validado." };
    }
    // Validade de 15 minutos (Regra 2)
    if (Date.now() > new Date(r.checkin.codeExpiresAt).getTime()) {
      return { ok: false, error: "O código expirou. Peça ao proprietário para gerar um novo." };
    }
    // Código de uso único (Regra 3)
    if (String(code).trim() !== r.checkin.code) {
      return { ok: false, error: "Código incorreto. Verifique os 6 dígitos." };
    }

    // Sincronização bilateral concluída (Regra 4)
    r.checkin.renterConfirmed = true;
    r.checkin.at = new Date().toISOString();
    r.state = "ATIVO";
    r.timeline.push({ state: "ATIVO", at: r.checkin.at,
      label: "Arrendatário validou o código — check-in bilateral concluído, aluguer ativo" });

    persist(r);
    return { ok: true, rental: r };
  }

  /** Estado legível do check-in para a UI. */
  function checkinStage(r) {
    const ck = r.checkin;
    if (!ck || !ck.code) return "AWAIT_OWNER";        // proprietário ainda não gerou
    if (!ck.renterConfirmed) {
      const expired = Date.now() > new Date(ck.codeExpiresAt).getTime();
      return expired ? "EXPIRED" : "AWAIT_RENTER";    // aguarda validação do arrendatário
    }
    return "DONE";
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
  // UC-10 — Reportar problema (US10.1)
  // ------------------------------------------------------------
  // Regras do backlog:
  //   - DANO: se o valor de mercado da ferramenta ≥ 50€, aciona o
  //           seguro (BR-07) e congela os pagamentos; aluguer → EM_DISPUTA.
  //   - FURTO: exige o upload obrigatório da queixa policial; sem o
  //           documento, a submissão é impedida.
  const INSURANCE_THRESHOLD = 50;     // valor de mercado mínimo p/ seguro (€)

  function report({ rentalId, type, notes, policeReportAttached, marketValue }) {
    const r = byId(rentalId);
    if (!r) return { ok: false, error: "Aluguer não encontrado." };
    const me = Auth.current();
    if (!me || roleOf(r) === null) return { ok: false, error: "Acesso não autorizado." };

    type = type || "OUTRO";          // DANO | ATRASO | FURTO | OUTRO

    // FURTO exige queixa policial (Cenário 2)
    if (type === "FURTO" && !policeReportAttached) {
      return { ok: false, error: "Para reportar um furto é obrigatório anexar a queixa policial." };
    }

    // DANO com valor ≥ 50€ aciona seguradora (Cenário 1)
    const tool = (Storage.read("tools", []) || []).find(t => t.id === r.toolId);
    const value = (typeof marketValue === "number") ? marketValue : (tool ? (tool.marketValue || tool.deposit || 0) : 0);
    const insuranceTriggered = (type === "DANO" && value >= INSURANCE_THRESHOLD) || type === "FURTO";

    const reports = Storage.read("reports", []);
    const rep = {
      id: Storage.uid("rep"),
      rentalId: r.id,
      type,
      notes: (notes || "").slice(0, 800),
      reporterId: me.id,
      policeReportAttached: !!policeReportAttached,
      marketValue: value,
      insuranceTriggered,
      createdAt: new Date().toISOString(),
      state: "PENDENTE_ANALISE"
    };
    reports.push(rep);
    Storage.write("reports", reports);

    r.reports = r.reports || [];
    r.reports.push(rep.id);

    // Congela pagamentos e move para disputa nos casos relevantes
    const movesToDispute = insuranceTriggered || r.state === "ATIVO" || r.state === "CONFIRMADO";
    if (movesToDispute) {
      r.state = "EM_DISPUTA";
      if (insuranceTriggered) r.paymentState = "FROZEN";
      const extra = insuranceTriggered ? " — seguradora notificada e pagamentos congelados (BR-07)" : "";
      r.timeline.push({ state: "EM_DISPUTA", at: rep.createdAt,
        label: `Sinistro reportado (${rep.type})${extra}` });
    } else {
      r.timeline.push({ state: r.state, at: rep.createdAt,
        label: `Problema reportado (${rep.type})` });
    }
    persist(r);
    return { ok: true, report: rep, insuranceTriggered };
  }

  return {
    ofCurrent, byId, groupForUser, roleOf, stateLabel, stateBadgeClass,
    generatePairing, validatePairing, checkinStage,
    checkOut, review, report,
    PAIRING_TTL_MIN, MIN_CHECKIN_PHOTOS, INSURANCE_THRESHOLD
  };
})();
