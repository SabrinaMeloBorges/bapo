import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  orderBy,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig, USE_EMULATOR } from "./firebase-config.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem O/0/I/1 pra evitar confusão

const AVATAR_SEEDS = ["Felix", "Aneka", "Milo", "Zoe", "Leo", "Nala", "Max", "Luna", "Coco", "Ivy", "Rex", "Mia"];
const AVATAR_STYLE = "adventurer";

const GROUP_ICON_SEEDS = ["Grupo1", "Grupo2", "Grupo3", "Grupo4", "Grupo5", "Grupo6", "Grupo7", "Grupo8"];
const GROUP_ICON_STYLE = "icons";

const COLOR_THEMES = {
  indigo: { label: "Índigo", light: ["#4f46e5", "#4338ca"], dark: ["#6366f1", "#7577f5"] },
  blue: { label: "Azul", light: ["#1d4ed8", "#1e40af"], dark: ["#3b82f6", "#60a5fa"] },
  green: { label: "Verde", light: ["#15803d", "#166534"], dark: ["#22c55e", "#4ade80"] },
  teal: { label: "Verde-água", light: ["#0f766e", "#115e59"], dark: ["#14b8a6", "#2dd4bf"] },
  cyan: { label: "Ciano", light: ["#0e7490", "#155e75"], dark: ["#22d3ee", "#67e8f9"] },
  pink: { label: "Rosa", light: ["#be185d", "#9d174d"], dark: ["#ec4899", "#f472b6"] },
  purple: { label: "Roxo", light: ["#7e22ce", "#6b21a8"], dark: ["#a855f7", "#c084fc"] },
  red: { label: "Vermelho", light: ["#b91c1c", "#991b1b"], dark: ["#ef4444", "#f87171"] },
  orange: { label: "Laranja", light: ["#c2410c", "#9a3412"], dark: ["#f97316", "#fb923c"] },
  amber: { label: "Âmbar", light: ["#b45309", "#92400e"], dark: ["#d97706", "#f59e0b"] },
};

// STUN/TURN não é mais necessário: o transporte agora é o Firestore (com
// persistência real), não mais conexão direta WebRTC entre navegadores.

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

if (USE_EMULATOR) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  console.info("[bapo] usando emuladores locais do Firebase");
}

const el = (id) => document.getElementById(id);

function avatarUrl(seed) {
  return `https://api.dicebear.com/9.x/${AVATAR_STYLE}/svg?seed=${encodeURIComponent(seed)}&size=80`;
}

function groupIconUrl(seed) {
  return `https://api.dicebear.com/9.x/${GROUP_ICON_STYLE}/svg?seed=${encodeURIComponent(seed)}&size=80&backgroundType=gradientLinear`;
}

function randomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// ---------- elementos ----------

const screenProfile = el("screen-profile");
const screenApp = el("screen-app");

const avatarGrid = el("avatar-grid");
const profileNameInput = el("profile-name");
const btnProfileContinue = el("btn-profile-continue");

const profileChip = el("profile-chip");
const chipAvatar = el("chip-avatar");
const chipName = el("chip-name");
const btnEditProfile = el("btn-edit-profile");

const sidebar = el("sidebar");
const chatListEl = el("chat-list");
const chatListEmpty = el("chat-list-empty");
const btnNewChat = el("btn-new-chat");

const emptyState = el("empty-state");
const activeChatEl = el("active-chat");
const btnBackSidebar = el("btn-back-sidebar");
const chatAvatarImg = el("chat-avatar");
const chatTitleEl = el("chat-title");
const chatSubtitleEl = el("chat-subtitle");
const btnChatInvite = el("btn-chat-invite");
const btnLeave = el("btn-leave");
const inviteBanner = el("invite-banner");
const inviteBannerCode = el("invite-banner-code");
const btnInviteBannerCopy = el("btn-invite-banner-copy");

const messagesEl = el("messages");
const messageForm = el("message-form");
const messageInput = el("message-input");
const btnSend = el("btn-send");

const appError = el("app-error");

const modalOverlay = el("new-chat-modal");
const modalTabs = el("modal-tabs");
const tabDirect = el("tab-direct");
const tabGroup = el("tab-group");
const tabJoin = el("tab-join");
const btnCreateDirect = el("btn-create-direct");
const groupNameInput = el("group-name-input");
const groupIconGrid = el("group-icon-grid");
const btnCreateGroup = el("btn-create-group");
const joinForm = el("join-form");
const joinCodeInput = el("join-code-input");
const modalError = el("modal-error");
const btnCloseModal = el("btn-close-modal");

const settingsFab = el("settings-fab");
const btnSettingsSidebar = el("btn-settings-sidebar");
const settingsPanel = el("settings-panel");
const colorSwatches = el("color-swatches");
const themeToggle = el("theme-toggle");

// ---------- estado ----------

let myProfile = null;
let myUid = null;
let pendingInvite = null;
let selectedAvatarSeed = AVATAR_SEEDS[0];
let selectedGroupIcon = GROUP_ICON_SEEDS[0];

const chats = new Map();
let activeChatId = null;
let unsubChatList = null;
let unsubMessages = null;
let renderedMessageIds = new Set();

function buildInviteLink(code) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("convite", code);
  return url.toString();
}

function showAppError(msg) {
  appError.textContent = msg;
  appError.classList.remove("hidden");
  setTimeout(() => appError.classList.add("hidden"), 6000);
}

// ---------- autenticação (anônima, sem senha) ----------

let authReadyResolve;
const authReady = new Promise((resolve) => {
  authReadyResolve = resolve;
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    myUid = user.uid;
    authReadyResolve(user);
  }
});

signInAnonymously(auth).catch((err) => {
  showAppError("Não foi possível conectar: " + err.message);
});

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

function buildGroupIconGrid() {
  groupIconGrid.innerHTML = "";
  GROUP_ICON_SEEDS.forEach((seed, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "avatar-option" + (i === 0 ? " selected" : "");
    btn.dataset.seed = seed;
    btn.setAttribute("aria-label", "Ícone " + (i + 1));

    const img = document.createElement("img");
    img.src = groupIconUrl(seed);
    img.alt = "";
    btn.appendChild(img);

    btn.addEventListener("click", () => {
      selectedGroupIcon = seed;
      [...groupIconGrid.children].forEach((c) => c.classList.remove("selected"));
      btn.classList.add("selected");
    });

    groupIconGrid.appendChild(btn);
  });
  selectedGroupIcon = GROUP_ICON_SEEDS[0];
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
  screenApp.classList.add("hidden");
  settingsFab.classList.remove("hidden");
}

profileNameInput.addEventListener("input", updateProfileContinueState);

btnProfileContinue.addEventListener("click", () => {
  const name = profileNameInput.value.trim();
  if (!name) return;
  saveProfile({ name, avatar: selectedAvatarSeed });
  updateProfileChip();
  screenProfile.classList.add("hidden");
  enterApp();
});

btnEditProfile.addEventListener("click", () => {
  showProfileScreen(myProfile);
});

// ---------- app principal ----------

async function enterApp() {
  screenApp.classList.remove("hidden");
  settingsFab.classList.add("hidden");
  await authReady;
  subscribeToChatList();
  if (pendingInvite) {
    const code = pendingInvite;
    pendingInvite = null;
    await handleJoinByCode(code, { auto: true });
  }
}

function subscribeToChatList() {
  if (unsubChatList) unsubChatList();
  const q = query(collection(db, "chats"), where("memberIds", "array-contains", myUid));
  unsubChatList = onSnapshot(
    q,
    (snap) => {
      chats.clear();
      snap.forEach((d) => chats.set(d.id, { id: d.id, ...d.data() }));
      renderChatList();
      if (activeChatId) updateActiveChatHeader(chats.get(activeChatId));
    },
    (err) => showAppError("Erro ao carregar conversas: " + err.message)
  );
}

function chatDisplayInfo(chat) {
  if (chat.type === "group") {
    return {
      name: chat.name || "Grupo",
      avatarSrc: groupIconUrl(chat.icon || GROUP_ICON_SEEDS[0]),
      isGroup: true,
    };
  }
  const otherUid = (chat.memberIds || []).find((id) => id !== myUid);
  const other = otherUid && chat.memberProfiles ? chat.memberProfiles[otherUid] : null;
  return {
    name: other ? other.name : "Aguardando alguém…",
    avatarSrc: other ? avatarUrl(other.avatar) : null,
    isGroup: false,
  };
}

function renderChatList() {
  const list = [...chats.values()].sort((a, b) => {
    const ta = (a.lastMessage && a.lastMessage.ts) || a.createdAt || 0;
    const tb = (b.lastMessage && b.lastMessage.ts) || b.createdAt || 0;
    return tb - ta;
  });

  chatListEmpty.classList.toggle("hidden", list.length > 0);
  chatListEl.innerHTML = "";

  list.forEach((chat) => {
    const info = chatDisplayInfo(chat);
    const item = document.createElement("button");
    item.type = "button";
    item.className = "chat-item" + (chat.id === activeChatId ? " active" : "");

    const avatar = document.createElement("img");
    avatar.className = "chat-item-avatar";
    avatar.alt = "";
    if (info.avatarSrc) avatar.src = info.avatarSrc;
    item.appendChild(avatar);

    const col = document.createElement("div");
    col.className = "chat-item-col";

    const nameRow = document.createElement("div");
    nameRow.className = "chat-item-name-row";
    const name = document.createElement("span");
    name.className = "chat-item-name";
    name.textContent = info.name;
    nameRow.appendChild(name);
    if (chat.lastMessage) {
      const time = document.createElement("span");
      time.className = "chat-item-time";
      time.textContent = formatTime(chat.lastMessage.ts);
      nameRow.appendChild(time);
    }
    col.appendChild(nameRow);

    const preview = document.createElement("p");
    preview.className = "chat-item-preview";
    preview.textContent = chat.lastMessage
      ? (chat.lastMessage.senderName ? chat.lastMessage.senderName + ": " : "") + chat.lastMessage.text
      : "Nenhuma mensagem ainda";
    col.appendChild(preview);

    item.appendChild(col);
    item.addEventListener("click", () => openChat(chat.id));
    chatListEl.appendChild(item);
  });
}

function openChat(chatId) {
  activeChatId = chatId;
  emptyState.classList.add("hidden");
  activeChatEl.classList.remove("hidden");
  screenApp.classList.add("showing-chat");
  messageInput.disabled = false;
  btnSend.disabled = false;
  updateActiveChatHeader(chats.get(chatId));
  subscribeToMessages(chatId);
  renderChatList();
  messageInput.focus();
}

function closeActiveChat() {
  activeChatId = null;
  if (unsubMessages) {
    unsubMessages();
    unsubMessages = null;
  }
  emptyState.classList.remove("hidden");
  activeChatEl.classList.add("hidden");
  screenApp.classList.remove("showing-chat");
  messageInput.disabled = true;
  btnSend.disabled = true;
  renderChatList();
}

btnBackSidebar.addEventListener("click", () => {
  screenApp.classList.remove("showing-chat");
});

function updateActiveChatHeader(chat) {
  if (!chat) {
    chatTitleEl.textContent = "Carregando…";
    chatSubtitleEl.textContent = "";
    inviteBanner.classList.add("hidden");
    return;
  }
  const info = chatDisplayInfo(chat);
  chatTitleEl.textContent = info.name;
  if (info.avatarSrc) {
    chatAvatarImg.src = info.avatarSrc;
    chatAvatarImg.classList.remove("hidden");
  } else {
    chatAvatarImg.classList.add("hidden");
  }

  const memberCount = (chat.memberIds || []).length;
  chatSubtitleEl.textContent = chat.type === "group" ? `${memberCount} participante${memberCount === 1 ? "" : "s"}` : "conversa individual";

  const waitingForPeer = memberCount < 2;
  inviteBanner.classList.toggle("hidden", !waitingForPeer);
  if (waitingForPeer) inviteBannerCode.textContent = chat.inviteCode;
}

// ---------- criar / entrar em conversas ----------

async function createDirectChat() {
  await authReady;
  const code = randomCode();
  const chatRef = await addDoc(collection(db, "chats"), {
    type: "direct",
    name: "",
    icon: null,
    inviteCode: code,
    memberIds: [myUid],
    memberProfiles: { [myUid]: myProfile },
    createdAt: Date.now(),
    lastMessage: null,
  });
  return chatRef.id;
}

async function createGroupChat(name, icon) {
  await authReady;
  const code = randomCode();
  const chatRef = await addDoc(collection(db, "chats"), {
    type: "group",
    name,
    icon,
    inviteCode: code,
    memberIds: [myUid],
    memberProfiles: { [myUid]: myProfile },
    createdAt: Date.now(),
    lastMessage: null,
  });
  return chatRef.id;
}

async function handleJoinByCode(rawCode, opts = {}) {
  await authReady;
  const code = rawCode.trim().toUpperCase();
  if (!code) return;

  try {
    const q = query(collection(db, "chats"), where("inviteCode", "==", code));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error("not-found");

    const chatDoc = snap.docs[0];
    const data = chatDoc.data();
    const alreadyIn = (data.memberIds || []).includes(myUid);

    if (!alreadyIn && data.type === "direct" && (data.memberIds || []).length >= 2) {
      throw new Error("full");
    }

    if (!alreadyIn) {
      await updateDoc(chatDoc.ref, {
        memberIds: arrayUnion(myUid),
        [`memberProfiles.${myUid}`]: myProfile,
      });
    }

    closeModal();
    openChat(chatDoc.id);
  } catch (err) {
    let msg = "Não foi possível entrar: " + err.message;
    if (err.message === "not-found") msg = "Código não encontrado.";
    if (err.message === "full") msg = "Essa conversa já tem duas pessoas.";
    if (opts.auto) showAppError(msg);
    else showModalError(msg);
  }
}

btnLeave.addEventListener("click", async () => {
  if (!activeChatId) return;
  if (!confirm("Sair desta conversa?")) return;
  const chatRef = doc(db, "chats", activeChatId);
  try {
    await updateDoc(chatRef, { memberIds: arrayRemove(myUid) });
  } catch (err) {
    showAppError("Erro ao sair: " + err.message);
  }
  closeActiveChat();
});

btnChatInvite.addEventListener("click", async () => {
  const chat = chats.get(activeChatId);
  if (!chat) return;
  const link = buildInviteLink(chat.inviteCode);
  try {
    await navigator.clipboard.writeText(link);
    flashText(btnChatInvite, "Link copiado!");
  } catch (e) {
    window.prompt("Copie o link do convite:", link);
  }
});

btnInviteBannerCopy.addEventListener("click", async () => {
  const chat = chats.get(activeChatId);
  if (!chat) return;
  const link = buildInviteLink(chat.inviteCode);
  try {
    await navigator.clipboard.writeText(link);
    flashText(btnInviteBannerCopy, "copiado!");
  } catch (e) {
    window.prompt("Copie o link do convite:", link);
  }
});

function flashText(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => (button.textContent = original), 1500);
}

// ---------- mensagens ----------

function subscribeToMessages(chatId) {
  if (unsubMessages) unsubMessages();
  messagesEl.innerHTML = "";
  renderedMessageIds = new Set();

  const q = query(collection(db, "chats", chatId, "messages"), orderBy("ts"));
  unsubMessages = onSnapshot(
    q,
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        if (renderedMessageIds.has(change.doc.id)) return;
        renderedMessageIds.add(change.doc.id);
        renderMessage(change.doc.data());
      });
    },
    (err) => showAppError("Erro nas mensagens: " + err.message)
  );
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function renderMessage(data) {
  const isMe = data.senderId === myUid;
  const chat = chats.get(activeChatId);

  const row = document.createElement("div");
  row.className = "message-row " + (isMe ? "row-me" : "row-them");

  const avatar = document.createElement("img");
  avatar.className = "msg-avatar";
  avatar.alt = "";
  avatar.src = avatarUrl(data.senderAvatar);
  row.appendChild(avatar);

  const col = document.createElement("div");
  col.className = "bubble-col";

  if (!isMe && chat && chat.type === "group") {
    const nameLabel = document.createElement("span");
    nameLabel.className = "msg-sender-name";
    nameLabel.textContent = data.senderName;
    col.appendChild(nameLabel);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble " + (isMe ? "bubble-me" : "bubble-them");

  const textNode = document.createElement("span");
  textNode.textContent = data.text;
  bubble.appendChild(textNode);

  const time = document.createElement("span");
  time.className = "bubble-time";
  time.textContent = formatTime(data.ts);
  bubble.appendChild(time);

  col.appendChild(bubble);
  row.appendChild(col);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !activeChatId) return;
  messageInput.value = "";

  const ts = Date.now();
  const chatRef = doc(db, "chats", activeChatId);
  try {
    await addDoc(collection(chatRef, "messages"), {
      senderId: myUid,
      senderName: myProfile.name,
      senderAvatar: myProfile.avatar,
      text,
      ts,
    });
    await updateDoc(chatRef, { lastMessage: { text, senderName: myProfile.name, ts } });
  } catch (err) {
    showAppError("Não foi possível enviar: " + err.message);
  }
});

// ---------- modal: nova conversa / grupo / entrar com código ----------

function openModal() {
  modalError.classList.add("hidden");
  modalOverlay.classList.remove("hidden");
}

function closeModal() {
  modalOverlay.classList.add("hidden");
  groupNameInput.value = "";
  joinCodeInput.value = "";
  modalError.classList.add("hidden");
}

function showModalError(msg) {
  modalError.textContent = msg;
  modalError.classList.remove("hidden");
}

btnNewChat.addEventListener("click", () => {
  buildGroupIconGrid();
  switchModalTab("direct");
  openModal();
});

btnCloseModal.addEventListener("click", closeModal);

modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

function switchModalTab(tab) {
  [...modalTabs.children].forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  tabDirect.classList.toggle("hidden", tab !== "direct");
  tabGroup.classList.toggle("hidden", tab !== "group");
  tabJoin.classList.toggle("hidden", tab !== "join");
  modalError.classList.add("hidden");
}

modalTabs.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  switchModalTab(btn.dataset.tab);
});

btnCreateDirect.addEventListener("click", async () => {
  btnCreateDirect.disabled = true;
  try {
    const chatId = await createDirectChat();
    closeModal();
    openChat(chatId);
  } catch (err) {
    showModalError("Erro ao criar conversa: " + err.message);
  }
  btnCreateDirect.disabled = false;
});

groupNameInput.addEventListener("input", () => {
  btnCreateGroup.disabled = !groupNameInput.value.trim();
});

btnCreateGroup.addEventListener("click", async () => {
  const name = groupNameInput.value.trim();
  if (!name) return;
  btnCreateGroup.disabled = true;
  try {
    const chatId = await createGroupChat(name, selectedGroupIcon);
    closeModal();
    openChat(chatId);
  } catch (err) {
    showModalError("Erro ao criar grupo: " + err.message);
    btnCreateGroup.disabled = false;
  }
});

joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  handleJoinByCode(joinCodeInput.value);
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

function toggleSettingsPanel() {
  settingsPanel.classList.toggle("hidden");
}

settingsFab.addEventListener("click", toggleSettingsPanel);
btnSettingsSidebar.addEventListener("click", toggleSettingsPanel);

document.addEventListener("click", (e) => {
  if (settingsPanel.classList.contains("hidden")) return;
  if (settingsPanel.contains(e.target) || settingsFab.contains(e.target) || btnSettingsSidebar.contains(e.target)) return;
  settingsPanel.classList.add("hidden");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    settingsPanel.classList.add("hidden");
    if (!modalOverlay.classList.contains("hidden")) closeModal();
  }
});

buildColorSwatches();
applyAppearance();

// ---------- inicialização ----------

const params = new URLSearchParams(window.location.search);
const invited = params.get("convite") ? params.get("convite").trim().toUpperCase() : null;
const savedProfile = loadProfile();

if (invited) {
  const url = new URL(window.location.href);
  url.search = "";
  window.history.replaceState({}, "", url.toString());
}

if (savedProfile) {
  myProfile = savedProfile;
  updateProfileChip();
  screenProfile.classList.add("hidden");
  pendingInvite = invited;
  enterApp();
} else {
  pendingInvite = invited;
  showProfileScreen(null);
}
