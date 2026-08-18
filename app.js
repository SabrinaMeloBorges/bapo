(() => {
  const ROOM_PREFIX = "bapo-";
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem O/0/I/1 pra evitar confusão

  const AVATAR_SEEDS = ["Felix", "Aneka", "Milo", "Zoe", "Leo", "Nala", "Max", "Luna"];
  const AVATAR_STYLE = "adventurer";

  const COLOR_THEMES = {
    indigo: { label: "Índigo", light: ["#4f46e5", "#4338ca"], dark: ["#6366f1", "#7577f5"] },
    blue: { label: "Azul", light: ["#1d4ed8", "#1e40af"], dark: ["#3b82f6", "#60a5fa"] },
    green: { label: "Verde", light: ["#15803d", "#166534"], dark: ["#22c55e", "#4ade80"] },
    pink: { label: "Rosa", light: ["#be185d", "#9d174d"], dark: ["#ec4899", "#f472b6"] },
    orange: { label: "Laranja", light: ["#c2410c", "#9a3412"], dark: ["#f97316", "#fb923c"] },
    teal: { label: "Verde-água", light: ["#0f766e", "#115e59"], dark: ["#14b8a6", "#2dd4bf"] },
  };

  // STUN cuida da maioria das conexões diretas; o TURN público (Open Relay Project)
  // entra como retransmissor de última instância quando as duas redes são muito
  // restritivas (comum quando as pessoas estão longe, em redes bem diferentes).
  const PEER_ICE_CONFIG = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:openrelay.metered.ca:80" },
      { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
    ],
  };

  const el = (id) => document.getElementById(id);

  function avatarUrl(seed) {
    return `https://api.dicebear.com/9.x/${AVATAR_STYLE}/svg?seed=${encodeURIComponent(seed)}&size=80`;
  }

  const screenProfile = el("screen-profile");
  const screenSetup = el("screen-setup");
  const screenChat = el("screen-chat");

  const setupAuto = el("setup-auto");
  const setupOptions = el("setup-options");
  const autoCode = el("auto-code");
  const autoStatusText = el("auto-status-text");
  const autoSpinner = setupAuto.querySelector(".spinner");
  const btnAutoRetry = el("btn-auto-retry");
  const btnAutoCancel = el("btn-auto-cancel");

  const btnCreate = el("btn-create");
  const shareBox = el("share-box");
  const shareLink = el("share-link");
  const btnCopy = el("btn-copy");
  const hostStatusText = el("host-status-text");

  const joinForm = el("join-form");
  const joinCodeInput = el("join-code");
  const btnJoin = el("btn-join");

  const setupError = el("setup-error");

  const peerDot = el("peer-dot");
  const peerAvatarImg = el("peer-avatar");
  const chatPeerName = el("chat-peer-name");
  const peerStatusText = el("peer-status-text");
  const btnLeave = el("btn-leave");
  const messagesEl = el("messages");
  const messageForm = el("message-form");
  const messageInput = el("message-input");
  const btnSend = el("btn-send");

  const avatarGrid = el("avatar-grid");
  const profileNameInput = el("profile-name");
  const btnProfileContinue = el("btn-profile-continue");
  const profileChip = el("profile-chip");
  const chipAvatar = el("chip-avatar");
  const chipName = el("chip-name");
  const btnEditProfile = el("btn-edit-profile");

  const settingsFab = el("settings-fab");
  const settingsPanel = el("settings-panel");
  const colorSwatches = el("color-swatches");
  const themeToggle = el("theme-toggle");

  let peer = null;
  let conn = null;
  let peerLeft = false;
  let myProfile = null;
  let peerProfile = null;
  let pendingInvite = null;
  let selectedAvatarSeed = AVATAR_SEEDS[0];

  function randomCode(length = 6) {
    let code = "";
    for (let i = 0; i < length; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
  }

  function showError(msg) {
    setupError.textContent = msg;
    setupError.classList.remove("hidden");
  }

  function clearError() {
    setupError.classList.add("hidden");
    setupError.textContent = "";
  }

  function destroyPeer() {
    if (conn) {
      try { conn.close(); } catch (e) {}
      conn = null;
    }
    if (peer) {
      try { peer.destroy(); } catch (e) {}
      peer = null;
    }
  }

  window.addEventListener("beforeunload", destroyPeer);

  // ---------- perfil (avatar + nome) ----------

  function loadProfile() {
    try {
      const raw = localStorage.getItem("bapo-profile");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.name && parsed.avatar) return parsed;
    } catch (e) {}
    return null;
  }

  function saveProfile(profile) {
    myProfile = profile;
    try {
      localStorage.setItem("bapo-profile", JSON.stringify(profile));
    } catch (e) {}
  }

  function buildAvatarGrid() {
    avatarGrid.innerHTML = "";
    AVATAR_SEEDS.forEach((seed) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avatar-option";
      btn.dataset.seed = seed;
      btn.setAttribute("aria-label", "Avatar " + seed);

      const img = document.createElement("img");
      img.src = avatarUrl(seed);
      img.alt = "";
      btn.appendChild(img);

      btn.addEventListener("click", () => {
        selectedAvatarSeed = seed;
        [...avatarGrid.children].forEach((c) => c.classList.remove("selected"));
        btn.classList.add("selected");
        updateProfileContinueState();
      });

      avatarGrid.appendChild(btn);
    });
  }

  function updateProfileContinueState() {
    btnProfileContinue.disabled = !profileNameInput.value.trim();
  }

  function selectAvatarInGrid(seed) {
    [...avatarGrid.children].forEach((c) => c.classList.toggle("selected", c.dataset.seed === seed));
  }

  function updateProfileChip() {
    if (!myProfile) return;
    chipAvatar.src = avatarUrl(myProfile.avatar);
    chipName.textContent = myProfile.name;
  }

  function showProfileScreen(prefill) {
    buildAvatarGrid();
    if (prefill) {
      profileNameInput.value = prefill.name;
      selectedAvatarSeed = prefill.avatar;
    } else {
      profileNameInput.value = "";
      selectedAvatarSeed = AVATAR_SEEDS[Math.floor(Math.random() * AVATAR_SEEDS.length)];
    }
    selectAvatarInGrid(selectedAvatarSeed);
    updateProfileContinueState();
    screenProfile.classList.remove("hidden");
    screenSetup.classList.add("hidden");
    screenChat.classList.add("hidden");
    settingsFab.classList.remove("hidden");
  }

  profileNameInput.addEventListener("input", updateProfileContinueState);

  btnProfileContinue.addEventListener("click", () => {
    const name = profileNameInput.value.trim();
    if (!name) return;
    saveProfile({ name, avatar: selectedAvatarSeed });
    updateProfileChip();
    screenProfile.classList.add("hidden");
    screenSetup.classList.remove("hidden");
    if (pendingInvite) {
      initAutoJoin(pendingInvite);
      pendingInvite = null;
    }
  });

  btnEditProfile.addEventListener("click", () => {
    showProfileScreen(myProfile);
  });

  // ---------- aparência (cor + modo) ----------

  function getThemeMode() {
    return localStorage.getItem("bapo-theme-mode") || "system";
  }

  function getThemeColor() {
    return localStorage.getItem("bapo-theme-color") || "indigo";
  }

  function resolvedMode() {
    const mode = getThemeMode();
    if (mode === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return mode;
  }

  function applyAppearance() {
    const mode = getThemeMode();
    if (mode === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", mode);
    }

    const colorKey = getThemeColor();
    const theme = COLOR_THEMES[colorKey] || COLOR_THEMES.indigo;
    const [primary, hover] = resolvedMode() === "dark" ? theme.dark : theme.light;
    document.documentElement.style.setProperty("--primary", primary);
    document.documentElement.style.setProperty("--primary-hover", hover);
    document.documentElement.style.setProperty("--bubble-me", primary);

    [...themeToggle.children].forEach((b) => b.classList.toggle("active", b.dataset.themeChoice === mode));
    [...colorSwatches.children].forEach((s) => s.classList.toggle("selected", s.dataset.color === colorKey));
  }

  function buildColorSwatches() {
    colorSwatches.innerHTML = "";
    Object.keys(COLOR_THEMES).forEach((key) => {
      const theme = COLOR_THEMES[key];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch";
      btn.dataset.color = key;
      btn.style.background = theme.light[0];
      btn.title = theme.label;
      btn.setAttribute("aria-label", theme.label);
      btn.addEventListener("click", () => {
        localStorage.setItem("bapo-theme-color", key);
        applyAppearance();
      });
      colorSwatches.appendChild(btn);
    });
  }

  themeToggle.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-theme-choice]");
    if (!btn) return;
    localStorage.setItem("bapo-theme-mode", btn.dataset.themeChoice);
    applyAppearance();
  });

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (getThemeMode() === "system") applyAppearance();
    });
  }

  settingsFab.addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (settingsPanel.classList.contains("hidden")) return;
    if (settingsPanel.contains(e.target) || settingsFab.contains(e.target)) return;
    settingsPanel.classList.add("hidden");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") settingsPanel.classList.add("hidden");
  });

  buildColorSwatches();
  applyAppearance();

  // ---------- criar sala (host) ----------

  function createRoom() {
    clearError();
    btnCreate.disabled = true;
    btnCreate.textContent = "Criando…";

    attemptCreate(0);
  }

  function attemptCreate(tries) {
    if (tries >= 5) {
      btnCreate.disabled = false;
      btnCreate.textContent = "Criar sala";
      showError("Não foi possível criar a sala agora. Tente novamente.");
      return;
    }

    const code = randomCode();
    const id = ROOM_PREFIX + code;
    const p = new Peer(id, { debug: 1, config: PEER_ICE_CONFIG });

    let settled = false;

    p.on("open", () => {
      settled = true;
      peer = p;
      btnCreate.textContent = "Sala criada";

      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("sala", code);
      shareLink.value = url.toString();

      shareBox.classList.remove("hidden");
      hostStatusText.textContent = "Aguardando a outra pessoa entrar…";

      p.on("connection", (incoming) => {
        if (conn && conn.open) {
          // já tem alguém na sala, recusa novas conexões
          incoming.on("open", () => {
            incoming.send({ type: "busy" });
            setTimeout(() => incoming.close(), 300);
          });
          return;
        }
        conn = incoming;
        wireConnection();
        conn.on("open", () => goToChat());
      });

      p.on("disconnected", () => {
        if (!peerLeft) p.reconnect();
      });
    });

    p.on("error", (err) => {
      if (settled) return;
      if (err.type === "unavailable-id") {
        p.destroy();
        attemptCreate(tries + 1);
      } else {
        btnCreate.disabled = false;
        btnCreate.textContent = "Criar sala";
        showError("Erro ao criar a sala: " + describeError(err));
      }
    });
  }

  btnCreate.addEventListener("click", createRoom);

  btnCopy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareLink.value);
      const original = btnCopy.textContent;
      btnCopy.textContent = "Copiado!";
      setTimeout(() => (btnCopy.textContent = original), 1500);
    } catch (e) {
      shareLink.select();
      document.execCommand("copy");
    }
  });

  // ---------- entrar em sala (guest) ----------

  function joinRoom(code) {
    clearError();
    code = code.trim().toUpperCase();
    if (!code) return;

    const p = new Peer({ debug: 1, config: PEER_ICE_CONFIG });
    let settled = false;

    p.on("open", () => {
      const c = p.connect(ROOM_PREFIX + code, { reliable: true });
      conn = c;
      peer = p;

      const timeout = setTimeout(() => {
        if (!settled) {
          showError("Não foi possível encontrar essa sala. Confira o código.");
          destroyPeer();
          resetJoinUI();
        }
      }, 12000);

      c.on("open", () => {
        settled = true;
        clearTimeout(timeout);
        wireConnection();
        goToChat();
      });

      c.on("error", () => {
        if (settled) return;
        clearTimeout(timeout);
        showError("Não foi possível conectar a essa sala.");
        destroyPeer();
        resetJoinUI();
      });
    });

    p.on("error", (err) => {
      if (settled) return;
      showError("Erro de conexão: " + describeError(err));
      resetJoinUI();
    });
  }

  function resetJoinUI() {
    btnJoin.disabled = false;
    btnJoin.textContent = "Entrar";
  }

  joinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    btnJoin.disabled = true;
    btnJoin.textContent = "Entrando…";
    joinRoom(joinCodeInput.value);
  });

  // ---------- fluxo de convite automático (?sala=CODE) ----------

  function initAutoJoin(code) {
    setupOptions.classList.add("hidden");
    setupAuto.classList.remove("hidden");
    autoCode.textContent = code;
    startAutoJoin(code);
  }

  function startAutoJoin(code) {
    autoSpinner.classList.remove("hidden");
    autoStatusText.textContent = "Conectando…";
    btnAutoRetry.classList.add("hidden");

    const p = new Peer({ debug: 1, config: PEER_ICE_CONFIG });
    let settled = false;

    p.on("open", () => {
      const c = p.connect(ROOM_PREFIX + code, { reliable: true });
      conn = c;
      peer = p;

      const timeout = setTimeout(() => {
        if (!settled) failAutoJoin("A sala não respondeu. A outra pessoa já entrou?");
      }, 12000);

      c.on("open", () => {
        settled = true;
        clearTimeout(timeout);
        wireConnection();
        goToChat();
      });

      c.on("error", () => {
        if (settled) return;
        clearTimeout(timeout);
        failAutoJoin("Não foi possível conectar a essa sala.");
      });
    });

    p.on("error", (err) => {
      if (settled) return;
      failAutoJoin(describeError(err));
    });
  }

  function failAutoJoin(msg) {
    destroyPeer();
    autoSpinner.classList.add("hidden");
    autoStatusText.textContent = msg;
    btnAutoRetry.classList.remove("hidden");
  }

  btnAutoRetry.addEventListener("click", () => startAutoJoin(autoCode.textContent));

  btnAutoCancel.addEventListener("click", () => {
    destroyPeer();
    const url = new URL(window.location.href);
    url.search = "";
    window.history.replaceState({}, "", url.toString());
    setupAuto.classList.add("hidden");
    setupOptions.classList.remove("hidden");
  });

  function describeError(err) {
    if (err && err.type === "peer-unavailable") return "sala não encontrada.";
    if (err && err.type === "network") return "problema de rede.";
    return (err && err.type) || "erro desconhecido";
  }

  // ---------- conexão de dados compartilhada ----------

  function wireConnection() {
    conn.on("data", (data) => {
      if (!data || typeof data !== "object") return;
      if (data.type === "msg") {
        renderMessage(data.text, "them", data.ts);
      } else if (data.type === "profile") {
        peerProfile = { name: data.name, avatar: data.avatar };
        updateChatHeaderPeer();
      } else if (data.type === "busy") {
        // sala já ocupada — só relevante do lado de quem tentou entrar
      }
    });

    conn.on("close", () => {
      peerLeft = true;
      setPeerOnline(false);
      renderSystemMessage((peerProfile ? peerProfile.name : "A outra pessoa") + " saiu da conversa.");
      messageInput.disabled = true;
      btnSend.disabled = true;
    });

    conn.on("error", () => {
      setPeerOnline(false);
    });
  }

  function goToChat() {
    screenProfile.classList.add("hidden");
    screenSetup.classList.add("hidden");
    screenChat.classList.remove("hidden");
    settingsPanel.classList.add("hidden");
    settingsFab.classList.add("hidden");
    peerProfile = null;
    peerAvatarImg.classList.add("hidden");
    chatPeerName.textContent = "bapo";
    setPeerOnline(true);
    messageInput.disabled = false;
    btnSend.disabled = false;
    messageInput.focus();
    conn.send({ type: "profile", name: myProfile.name, avatar: myProfile.avatar });
  }

  function updateChatHeaderPeer() {
    if (!peerProfile) return;
    chatPeerName.textContent = peerProfile.name;
    peerAvatarImg.src = avatarUrl(peerProfile.avatar);
    peerAvatarImg.classList.remove("hidden");
  }

  function setPeerOnline(online) {
    peerDot.classList.toggle("dot-online", online);
    peerDot.classList.toggle("dot-offline", !online);
    peerStatusText.textContent = online ? "conectado" : "desconectado";
  }

  // ---------- mensagens ----------

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function renderMessage(text, who, ts) {
    const row = document.createElement("div");
    row.className = "message-row " + (who === "me" ? "row-me" : "row-them");

    const avatarSeed = who === "me" ? myProfile.avatar : peerProfile && peerProfile.avatar;

    const avatar = document.createElement("img");
    avatar.className = "msg-avatar";
    avatar.alt = "";
    if (avatarSeed) avatar.src = avatarUrl(avatarSeed);
    row.appendChild(avatar);

    const bubble = document.createElement("div");
    bubble.className = "bubble " + (who === "me" ? "bubble-me" : "bubble-them");

    const textNode = document.createElement("span");
    textNode.textContent = text;
    bubble.appendChild(textNode);

    const time = document.createElement("span");
    time.className = "bubble-time";
    time.textContent = formatTime(ts);
    bubble.appendChild(time);

    row.appendChild(bubble);
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderSystemMessage(text) {
    const bubble = document.createElement("div");
    bubble.className = "bubble bubble-system";
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  messageForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !conn || !conn.open) return;

    const ts = Date.now();
    conn.send({ type: "msg", text, ts });
    renderMessage(text, "me", ts);
    messageInput.value = "";
    messageInput.focus();
  });

  btnLeave.addEventListener("click", () => {
    if (confirm("Sair da conversa? Ela não pode ser retomada depois.")) {
      destroyPeer();
      window.location.href = window.location.pathname;
    }
  });

  // ---------- inicialização ----------

  const params = new URLSearchParams(window.location.search);
  const invited = params.get("sala") ? params.get("sala").trim().toUpperCase() : null;
  const savedProfile = loadProfile();

  if (savedProfile) {
    myProfile = savedProfile;
    updateProfileChip();
    screenProfile.classList.add("hidden");
    screenSetup.classList.remove("hidden");
    if (invited) initAutoJoin(invited);
  } else {
    pendingInvite = invited;
    showProfileScreen(null);
  }
})();
