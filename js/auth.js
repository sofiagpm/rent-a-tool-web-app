/* =============================================================
   auth.js — UC-01 (Criar conta) e gestão de sessão
   ----------------------------------------------------------------
   Implementação simplificada de:
   - registo de utilizador (nome, email, telefone, data nasc.)
   - simulação de KYC (Chave Móvel Digital / upload de doc)
   - cálculo de idade (≥ 16 — BR-01)
   - login e logout (sem palavra-passe nesta iteração)

   Nota MASE: numa iteração futura, KYC seria delegado em
   integrações externas (Chave Móvel Digital / Onfido). Aqui
   simulamos a confirmação dessas integrações.
   ============================================================= */

const Auth = (() => {

  /** Retorna o utilizador atualmente em sessão, ou null. */
  function current() {
    const sess = Storage.read("session", null);
    if (!sess) return null;
    const users = Storage.read("users", []);
    return users.find(u => u.id === sess.userId) || null;
  }

  /** Verdadeiro se há sessão ativa. */
  function isLogged() { return current() !== null; }

  /** Verdadeiro se o utilizador atual tem o Trusted Badge (KYC validado). */
  function isTrusted() {
    const u = current();
    return !!(u && u.trustedBadge);
  }

  /** Termina sessão. */
  function logout() {
    Storage.write("session", null);
    UI.toast("Sessão terminada.", "info");
    location.hash = "#/";
    App.refresh();
  }

  /** Inicia sessão para um utilizador (por id). */
  function loginAs(userId) {
    Storage.write("session", { userId, since: new Date().toISOString() });
    App.refresh();
  }

  /** Calcula idade em anos completos a partir de yyyy-mm-dd. */
  function ageFrom(birthISO) {
    if (!birthISO) return 0;
    const b = new Date(birthISO);
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
  }

  /** Valida um email (validação simples para a demo). */
  function isValidEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");
  }

  /**
   * Cria uma conta. Devolve { ok: true, user } ou { ok: false, errors }.
   * `kycMethod` é "cmd" (Chave Móvel Digital) ou "doc" (upload — fica pendente).
   */
  function register({ name, email, phone, birthDate, kycMethod, city }) {
    const errors = {};
    if (!name || name.trim().length < 2) errors.name = "Indique o seu nome completo.";
    if (!isValidEmail(email)) errors.email = "Email inválido.";
    if (!phone || phone.trim().length < 6) errors.phone = "Indique um contacto telefónico válido.";
    if (!birthDate) errors.birthDate = "Indique a data de nascimento.";
    else if (ageFrom(birthDate) < 16) errors.birthDate = "É necessário ter pelo menos 16 anos (BR-01).";

    // Email único
    const users = Storage.read("users", []);
    if (users.some(u => u.email.toLowerCase() === (email || "").toLowerCase())) {
      errors.email = "Já existe uma conta com este email.";
    }

    if (Object.keys(errors).length) return { ok: false, errors };

    // Resultado do KYC: a Chave Móvel Digital valida na hora; o upload de
    // documento fica em "PENDENTE" (simulação do fluxo BackOffice — UC-11).
    const kycValidatedNow = kycMethod === "cmd";

    const user = {
      id: Storage.uid("usr"),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      birthDate,
      city: city || "",
      kycStatus: kycValidatedNow ? "VALIDADO" : "PENDENTE",
      kycMethod,
      trustedBadge: kycValidatedNow,
      rating: 0,
      ratingCount: 0,
      createdAt: new Date().toISOString()
    };

    users.push(user);
    Storage.write("users", users);
    Storage.write("session", { userId: user.id, since: new Date().toISOString() });

    return { ok: true, user };
  }

  /** Tenta fazer login por email (sem palavra-passe — apropriado para a demo). */
  function loginByEmail(email) {
    const users = Storage.read("users", []);
    const u = users.find(x => x.email.toLowerCase() === (email || "").toLowerCase());
    if (!u) return { ok: false, error: "Não existe conta com este email." };
    Storage.write("session", { userId: u.id, since: new Date().toISOString() });
    return { ok: true, user: u };
  }

  return { current, isLogged, isTrusted, logout, loginAs, register, loginByEmail, ageFrom };
})();
