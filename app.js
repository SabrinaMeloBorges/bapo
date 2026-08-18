import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  linkWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  orderBy,
  writeBatch,
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

const PRESENCE_HEARTBEAT_MS = 20000;
const PRESENCE_ONLINE_WINDOW_MS = 35000;
const PRESENCE_INACTIVE_WINDOW_MS = 5 * 60000;
const MESSAGE_TTL_MS = 30 * 60000;
const PURGE_CHECK_INTERVAL_MS = 5 * 60000;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

if (USE_EMULATOR) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  console.info("[bapo] usando emuladores locais do Firebase");
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

const el = (id) => document.getElementById(id);

// Um avatar pessoal pode ser um "seed" (ilustração gerada) ou uma foto
// enviada pelo usuário, guardada como data URL (base64) direto no perfil.
function resolveAvatarSrc(value) {
  if (!value) return "";
  if (value.startsWith("data:image")) return value;
  return `https://api.dicebear.com/9.x/${AVATAR_STYLE}/svg?seed=${encodeURIComponent(value)}&size=80`;
}

function groupIconUrl(seed) {
  return `https://api.dicebear.com/9.x/${GROUP_ICON_STYLE}/svg?seed=${encodeURIComponent(seed)}&size=80&backgroundType=gradientLinear`;
}

function resizeImageFile(file, size = 128, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Não foi possível ler essa imagem."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function randomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// ---------- criptografia (Web Crypto API, nativa do navegador) ----------
//
// Conversas individuais: cada aparelho tem seu próprio par de chaves ECDH
// (P-256). A chave privada nunca sai do navegador. As duas pessoas calculam,
// cada uma do seu lado, o mesmo segredo compartilhado (Diffie-Hellman) e
// usam isso pra cifrar/decifrar com AES-GCM. O servidor (Firestore) só vê o
// texto cifrado.
// Grupos: um "combinado de código" não dá pra fazer Diffie-Hellman par-a-par
// com todo mundo de forma simples, então o grupo tem uma chave AES única,
// guardada no próprio documento do chat — protegida pelas regras do Firestore
// (só quem já é membro consegue ler o documento), mas não é uma chave
// "embrulhada" pra cada pessoa como fariam apps de ponta-a-ponta completos.

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

let myKeyPair = null;

async function ensureKeyPair() {
  if (myKeyPair) return myKeyPair;
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem("bapo-keypair") || "null");
  } catch (e) {}

  if (stored) {
    try {
      const publicKey = await crypto.subtle.importKey("jwk", stored.publicKeyJwk, { name: "ECDH", namedCurve: "P-256" }, true, []);
      const privateKey = await crypto.subtle.importKey("jwk", stored.privateKeyJwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]);
      myKeyPair = { publicKey, privateKey, publicKeyJwk: stored.publicKeyJwk };
      return myKeyPair;
    } catch (e) {}
  }

  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  try {
    localStorage.setItem("bapo-keypair", JSON.stringify({ publicKeyJwk, privateKeyJwk }));
  } catch (e) {}
  myKeyPair = { publicKey: pair.publicKey, privateKey: pair.privateKey, publicKeyJwk };
  return myKeyPair;
}

async function deriveSharedKey(otherPublicKeyJwk) {
  const otherKey = await crypto.subtle.importKey("jwk", otherPublicKeyJwk, { name: "ECDH", namedCurve: "P-256" }, true, []);
  return crypto.subtle.deriveKey({ name: "ECDH", public: otherKey }, myKeyPair.privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function generateGroupKeyRaw() {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = await crypto.subtle.exportKey("raw", key);
  return bufToB64(raw);
}

const chatKeyCache = new Map();

async function getChatKey(chat) {
  if (!chat) return null;
  const cached = chatKeyCache.get(chat.id);
  if (cached) return cached;
  try {
    let key = null;
    if (chat.type === "group") {
      if (!chat.encKeyRaw) return null;
      key = await crypto.subtle.importKey("raw", b64ToBuf(chat.encKeyRaw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    } else {
      const otherUid = (chat.memberIds || []).find((id) => id !== myUid);
      const other = otherUid && chat.memberProfiles ? chat.memberProfiles[otherUid] : null;
      if (!other || !other.publicKeyJwk) return null;
      key = await deriveSharedKey(other.publicKeyJwk);
    }
    chatKeyCache.set(chat.id, key);
    return key;
  } catch (e) {
    return null;
  }
}

async function encryptText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return { ciphertext: bufToB64(buf), iv: bufToB64(iv) };
}

async function decryptText(key, ciphertext, iv) {
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(b64ToBuf(iv)) }, key, b64ToBuf(ciphertext));
  return new TextDecoder().decode(buf);
}

async function decryptPreview(chat, lastMessage) {
  if (!lastMessage) return "Nenhuma mensagem ainda";
  const prefix = lastMessage.senderName ? lastMessage.senderName + ": " : "";
  const key = await getChatKey(chat);
  if (!key) return prefix + "🔒";
  try {
    const text = await decryptText(key, lastMessage.ciphertext, lastMessage.iv);
    return prefix + text;
  } catch (e) {
    return prefix + "🔒";
  }
}

function myMemberProfile() {
  return { name: myProfile.name, avatar: myProfile.avatar, publicKeyJwk: myKeyPair.publicKeyJwk };
}

function samePublicKey(a, b) {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

async function refreshMyPublicKeyIfNeeded(chat) {
  if (!chat || chat.type !== "direct") return;
  const mine = chat.memberProfiles && chat.memberProfiles[myUid];
  if (samePublicKey(mine && mine.publicKeyJwk, myKeyPair.publicKeyJwk)) return;
  try {
    await updateDoc(doc(db, "chats", chat.id), { [`memberProfiles.${myUid}`]: myMemberProfile() });
    chatKeyCache.delete(chat.id);
  } catch (e) {}
}

// ---------- elementos ----------

const screenAuth = el("screen-auth");
const authEmailInput = el("auth-email");
const authPasswordInput = el("auth-password");
const btnAuthLogin = el("btn-auth-login");
const btnAuthSignup = el("btn-auth-signup");
const btnAuthGoogle = el("btn-auth-google");
const btnAuthAnon = el("btn-auth-anon");
const authError = el("auth-error");
const btnLogout = el("btn-logout");
const btnLinkGoogle = el("btn-link-google");

const screenProfile = el("screen-profile");
const screenApp = el("screen-app");

const avatarGrid = el("avatar-grid");
const btnAvatarUpload = el("btn-avatar-upload");
const avatarFileInput = el("avatar-file-input");
const profileNameInput = el("profile-name");
const btnProfileContinue = el("btn-profile-continue");

const chipAvatar = el("chip-avatar");
const chipName = el("chip-name");
const btnEditProfile = el("btn-edit-profile");

const chatListEl = el("chat-list");
const chatListEmpty = el("chat-list-empty");
const btnNewChat = el("btn-new-chat");

const emptyState = el("empty-state");
const activeChatEl = el("active-chat");
const btnBackSidebar = el("btn-back-sidebar");
const chatAvatarImg = el("chat-avatar");
const chatTitleEl = el("chat-title");
const chatSubtitleEl = el("chat-subtitle");
const btnChatMenu = el("btn-chat-menu");
const chatMenu = el("chat-menu");
const btnParticipants = el("btn-participants");
const participantsModal = el("participants-modal");
const participantsList = el("participants-list");
const btnCloseParticipants = el("btn-close-participants");
const btnChatInvite = el("btn-chat-invite");
const btnClearChat = el("btn-clear-chat");
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
const messageRows = new Map(); // messageId -> { row, ticksEl, data }

let presenceInterval = null;
let unsubPeerPresence = null;
let lastPeerPresence = null;
let presenceRenderInterval = null;

let autoPurgeInterval = null;

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

// ---------- autenticação (e-mail ou anônima) ----------

let authReadyResolve;
const authReady = new Promise((resolve) => {
  authReadyResolve = resolve;
});

function describeAuthError(err) {
  const map = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/missing-password": "Digite uma senha.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/email-already-in-use": "Já existe uma conta com esse e-mail. Tente entrar.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Não existe conta com esse e-mail.",
    "auth/too-many-requests": "Muitas tentativas. Espere um pouco e tente de novo.",
    "auth/unauthorized-domain": "Este site ainda não está autorizado no Firebase (Authentication → Settings → Authorized domains).",
    "auth/popup-blocked": "O navegador bloqueou o pop-up de login. Permita pop-ups e tente de novo.",
  };
  return map[err.code] || err.message;
}

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove("hidden");
}

btnAuthLogin.addEventListener("click", async () => {
  authError.classList.add("hidden");
  try {
    await signInWithEmailAndPassword(auth, authEmailInput.value.trim(), authPasswordInput.value);
  } catch (err) {
    showAuthError(describeAuthError(err));
  }
});

btnAuthSignup.addEventListener("click", async () => {
  authError.classList.add("hidden");
  try {
    await createUserWithEmailAndPassword(auth, authEmailInput.value.trim(), authPasswordInput.value);
  } catch (err) {
    showAuthError(describeAuthError(err));
  }
});

btnAuthGoogle.addEventListener("click", async () => {
  authError.classList.add("hidden");
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
      showAuthError(describeAuthError(err));
    }
  }
});

btnAuthAnon.addEventListener("click", async () => {
  authError.classList.add("hidden");
  try {
    await signInAnonymously(auth);
  } catch (err) {
    showAuthError(describeAuthError(err));
  }
});

btnLogout.addEventListener("click", async () => {
  if (!confirm("Sair da conta neste aparelho?")) return;
  try {
    localStorage.removeItem("bapo-profile");
    await signOut(auth);
    window.location.href = window.location.pathname;
  } catch (e) {}
});

btnLinkGoogle.addEventListener("click", async () => {
  try {
    await linkWithPopup(auth.currentUser, new GoogleAuthProvider());
    btnLinkGoogle.classList.add("hidden");
    btnLogout.classList.remove("hidden");
    if (myProfile) await saveProfile(myProfile); // agora sincroniza em users/{uid}
    window.alert("Conta Google vinculada! Suas conversas continuam exatamente como estavam, e agora dá pra entrar com essa conta em qualquer aparelho.");
  } catch (err) {
    if (err.code === "auth/credential-already-in-use") {
      window.alert("Essa conta Google já é usada por outra conta do bapo. Se quiser usá-la, saia (Sair da conta) e entre com o Google na tela inicial — mas aí as conversas deste aparelho anônimo não vão junto.");
    } else if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
      window.alert("Não foi possível vincular: " + describeAuthError(err));
    }
  }
});

let bootStarted = false;

onAuthStateChanged(auth, (user) => {
  if (user) {
    myUid = user.uid;
    authReadyResolve(user);
    btnLogout.classList.toggle("hidden", user.isAnonymous);
    btnLinkGoogle.classList.toggle("hidden", !user.isAnonymous);
    if (!bootStarted) {
      bootStarted = true;
      boot();
    }
  } else {
    screenAuth.classList.remove("hidden");
    settingsFab.classList.remove("hidden");
  }
});

// ---------- perfil (avatar + nome) ----------

async function loadProfile() {
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    try {
      const snap = await getDoc(doc(db, "users", myUid));
      if (snap.exists()) return snap.data();
    } catch (e) {}
    return null;
  }
  try {
    const raw = localStorage.getItem("bapo-profile");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.name && parsed.avatar) return parsed;
  } catch (e) {}
  return null;
}

async function saveProfile(profile) {
  myProfile = profile;
  try {
    localStorage.setItem("bapo-profile", JSON.stringify(profile));
  } catch (e) {}
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    try {
      await setDoc(doc(db, "users", myUid), profile);
    } catch (e) {}
  }
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
    img.src = resolveAvatarSrc(seed);
    img.alt = "";
    btn.appendChild(img);

    btn.addEventListener("click", () => {
      selectedAvatarSeed = seed;
      [...avatarGrid.children].forEach((c) => c.classList.remove("selected"));
      btn.classList.add("selected");
      resetUploadTilePreview();
      updateProfileContinueState();
    });

    avatarGrid.appendChild(btn);
  });
  avatarGrid.appendChild(btnAvatarUpload); // reencaixa o botão de upload no fim da grade
}

function resetUploadTilePreview() {
  btnAvatarUpload.classList.remove("selected");
  btnAvatarUpload.innerHTML = "<span>+</span>";
}

function setUploadTilePreview(dataUrl) {
  btnAvatarUpload.innerHTML = "";
  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "";
  btnAvatarUpload.appendChild(img);
  btnAvatarUpload.classList.add("selected");
}

btnAvatarUpload.addEventListener("click", () => avatarFileInput.click());

avatarFileInput.addEventListener("change", async () => {
  const file = avatarFileInput.files[0];
  avatarFileInput.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    window.alert("Escolha um arquivo de imagem.");
    return;
  }
  try {
    const dataUrl = await resizeImageFile(file);
    selectedAvatarSeed = dataUrl;
    [...avatarGrid.querySelectorAll(".avatar-option[data-seed]")].forEach((c) => c.classList.remove("selected"));
    setUploadTilePreview(dataUrl);
    updateProfileContinueState();
  } catch (err) {
    window.alert(err.message);
  }
});

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
  const isUpload = seed && seed.startsWith("data:image");
  [...avatarGrid.querySelectorAll(".avatar-option[data-seed]")].forEach((c) => c.classList.toggle("selected", !isUpload && c.dataset.seed === seed));
  if (isUpload) setUploadTilePreview(seed);
  else resetUploadTilePreview();
}

function updateProfileChip() {
  if (!myProfile) return;
  chipAvatar.src = resolveAvatarSrc(myProfile.avatar);
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
  screenAuth.classList.add("hidden");
  screenProfile.classList.remove("hidden");
  screenApp.classList.add("hidden");
  settingsFab.classList.remove("hidden");
}

profileNameInput.addEventListener("input", updateProfileContinueState);

btnProfileContinue.addEventListener("click", async () => {
  const name = profileNameInput.value.trim();
  if (!name) return;
  btnProfileContinue.disabled = true;
  await saveProfile({ name, avatar: selectedAvatarSeed });
  updateProfileChip();
  screenProfile.classList.add("hidden");
  enterApp();
});

btnEditProfile.addEventListener("click", () => {
  showProfileScreen(myProfile);
});

// ---------- app principal ----------

async function boot() {
  await ensureKeyPair();
  const profile = await loadProfile();

  const params = new URLSearchParams(window.location.search);
  const invited = params.get("convite") ? params.get("convite").trim().toUpperCase() : null;
  if (invited) {
    const url = new URL(window.location.href);
    url.search = "";
    window.history.replaceState({}, "", url.toString());
  }
  pendingInvite = invited;

  if (profile) {
    myProfile = profile;
    updateProfileChip();
    screenAuth.classList.add("hidden");
    screenProfile.classList.add("hidden");
    enterApp();
  } else {
    showProfileScreen(null);
  }
}

async function enterApp() {
  screenApp.classList.remove("hidden");
  settingsFab.classList.add("hidden");
  await authReady;
  subscribeToChatList();
  startPresenceHeartbeat();
  startAutoPurge();
  if (!presenceRenderInterval) {
    presenceRenderInterval = setInterval(renderPeerPresence, 15000);
  }
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
    avatarSrc: other ? resolveAvatarSrc(other.avatar) : null,
    isGroup: false,
    otherUid: otherUid || null,
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
    preview.textContent = "…";
    decryptPreview(chat, chat.lastMessage).then((text) => {
      preview.textContent = text;
    });
    col.appendChild(preview);

    item.appendChild(col);
    item.addEventListener("click", () => openChat(chat.id));
    chatListEl.appendChild(item);
  });
}

function openChat(chatId) {
  activeChatId = chatId;
  chatMenu.classList.add("hidden");
  emptyState.classList.add("hidden");
  activeChatEl.classList.remove("hidden");
  screenApp.classList.add("showing-chat");
  messageInput.disabled = false;
  btnSend.disabled = false;
  const chat = chats.get(chatId);
  updateActiveChatHeader(chat);
  refreshMyPublicKeyIfNeeded(chat);
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
  if (unsubPeerPresence) {
    unsubPeerPresence();
    unsubPeerPresence = null;
  }
  lastPeerPresence = null;
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
  if (chat.type === "group") {
    chatSubtitleEl.textContent = `${memberCount} participante${memberCount === 1 ? "" : "s"}`;
    btnLeave.textContent = "Sair do grupo";
    btnLeave.title = "Sair do grupo";
    btnParticipants.classList.remove("hidden");
  } else {
    btnLeave.textContent = "Apagar contato";
    btnLeave.title = "Apagar esse contato";
    if (memberCount < 2) chatSubtitleEl.textContent = "";
    // com 2 membros, o texto vem da presença (subscribePeerPresence/renderPresence)
    btnParticipants.classList.add("hidden");
  }

  const waitingForPeer = memberCount < 2;
  inviteBanner.classList.toggle("hidden", !waitingForPeer);
  if (waitingForPeer) inviteBannerCode.textContent = chat.inviteCode;

  subscribePeerPresence(chat, info.otherUid);
}

// ---------- criar / entrar em conversas ----------

async function createDirectChat() {
  await authReady;
  await ensureKeyPair();
  const code = randomCode();
  const chatRef = await addDoc(collection(db, "chats"), {
    type: "direct",
    name: "",
    icon: null,
    inviteCode: code,
    memberIds: [myUid],
    memberProfiles: { [myUid]: myMemberProfile() },
    createdAt: Date.now(),
    lastMessage: null,
  });
  await setDoc(doc(db, "invites", code), { chatId: chatRef.id, type: "direct" });
  return chatRef.id;
}

async function createGroupChat(name, icon) {
  await authReady;
  await ensureKeyPair();
  const code = randomCode();
  const encKeyRaw = await generateGroupKeyRaw();
  const chatRef = await addDoc(collection(db, "chats"), {
    type: "group",
    name,
    icon,
    inviteCode: code,
    encKeyRaw,
    memberIds: [myUid],
    memberProfiles: { [myUid]: myMemberProfile() },
    createdAt: Date.now(),
    lastMessage: null,
  });
  await setDoc(doc(db, "invites", code), { chatId: chatRef.id, type: "group", name });
  return chatRef.id;
}

async function handleJoinByCode(rawCode, opts = {}) {
  await authReady;
  await ensureKeyPair();
  const code = rawCode.trim().toUpperCase();
  if (!code) return;

  try {
    const inviteSnap = await getDoc(doc(db, "invites", code));
    if (!inviteSnap.exists()) throw new Error("not-found");
    const { chatId } = inviteSnap.data();
    const chatRef = doc(db, "chats", chatId);

    await updateDoc(chatRef, {
      memberIds: arrayUnion(myUid),
      [`memberProfiles.${myUid}`]: myMemberProfile(),
    });

    const chatSnap = await getDoc(chatRef);
    const data = chatSnap.data();
    if (data.type === "direct" && (data.memberIds || []).length > 2) {
      await updateDoc(chatRef, { memberIds: arrayRemove(myUid) });
      throw new Error("full");
    }

    closeModal();
    openChat(chatId);
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
  const chat = chats.get(activeChatId);
  const isGroup = chat && chat.type === "group";
  const confirmMsg = isGroup ? "Sair deste grupo?" : "Apagar esse contato? A conversa some da sua lista.";
  if (!confirm(confirmMsg)) return;
  const chatRef = doc(db, "chats", activeChatId);
  try {
    await updateDoc(chatRef, { memberIds: arrayRemove(myUid) });
  } catch (err) {
    showAppError("Erro ao remover: " + err.message);
  }
  closeActiveChat();
});

btnClearChat.addEventListener("click", async () => {
  if (!activeChatId) return;
  if (!confirm("Apagar todas as mensagens desta conversa? Isso não pode ser desfeito.")) return;
  try {
    await clearChatMessages(activeChatId);
  } catch (err) {
    showAppError("Erro ao limpar: " + err.message);
  }
});

async function clearChatMessages(chatId) {
  const snap = await getDocs(collection(db, "chats", chatId, "messages"));
  if (!snap.empty) {
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await updateDoc(doc(db, "chats", chatId), { lastMessage: null });
}

async function purgeOldMessages(chatId) {
  const cutoff = Date.now() - MESSAGE_TTL_MS;
  const q = query(collection(db, "chats", chatId, "messages"), where("ts", "<", cutoff));
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  const chat = chats.get(chatId);
  if (chat && chat.lastMessage && chat.lastMessage.ts < cutoff) {
    await updateDoc(doc(db, "chats", chatId), { lastMessage: null }).catch(() => {});
  }
}

function sweepAllChats() {
  chats.forEach((chat) => purgeOldMessages(chat.id).catch(() => {}));
}

function startAutoPurge() {
  if (autoPurgeInterval) clearInterval(autoPurgeInterval);
  // pequeno atraso pra dar tempo da lista de conversas (subscribeToChatList) carregar
  // antes da primeira varredura — senão ela roda com `chats` ainda vazio.
  setTimeout(sweepAllChats, 3000);
  autoPurgeInterval = setInterval(sweepAllChats, PURGE_CHECK_INTERVAL_MS);
}

// ---------- presença (online / inativo / em hibernação) ----------

function presenceRef(uid) {
  return doc(db, "presence", uid);
}

function writePresence(state) {
  if (!myUid) return;
  setDoc(presenceRef(myUid), { state, lastActiveAt: Date.now() }).catch(() => {});
}

function startPresenceHeartbeat() {
  const beat = () => writePresence(document.hasFocus() ? "online" : "inactive");
  beat();
  presenceInterval = setInterval(beat, PRESENCE_HEARTBEAT_MS);
  document.addEventListener("visibilitychange", beat);
  window.addEventListener("focus", beat);
  window.addEventListener("blur", beat);
}

function subscribePeerPresence(chat, otherUid) {
  if (unsubPeerPresence) {
    unsubPeerPresence();
    unsubPeerPresence = null;
  }
  lastPeerPresence = null;

  if (!chat || chat.type !== "direct" || !otherUid) return;

  unsubPeerPresence = onSnapshot(presenceRef(otherUid), (snap) => {
    lastPeerPresence = snap.exists() ? snap.data() : null;
    renderPeerPresence();
  });
}

function renderPeerPresence() {
  const chat = chats.get(activeChatId);
  if (!chat || chat.type !== "direct" || (chat.memberIds || []).length < 2) return;

  if (!lastPeerPresence) {
    chatSubtitleEl.textContent = "em hibernação";
    return;
  }
  const diff = Date.now() - lastPeerPresence.lastActiveAt;
  if (diff < PRESENCE_ONLINE_WINDOW_MS && lastPeerPresence.state === "online") {
    chatSubtitleEl.textContent = "online agora";
  } else if (diff < PRESENCE_INACTIVE_WINDOW_MS) {
    chatSubtitleEl.textContent = "inativo";
  } else {
    chatSubtitleEl.textContent = "em hibernação";
  }
}

btnChatMenu.addEventListener("click", (e) => {
  e.stopPropagation();
  chatMenu.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (chatMenu.classList.contains("hidden")) return;
  if (chatMenu.contains(e.target) || btnChatMenu.contains(e.target)) return;
  chatMenu.classList.add("hidden");
});

[btnParticipants, btnChatInvite, btnClearChat, btnLeave].forEach((b) => {
  b.addEventListener("click", () => chatMenu.classList.add("hidden"));
});

btnParticipants.addEventListener("click", () => {
  const chat = chats.get(activeChatId);
  if (!chat) return;
  participantsList.innerHTML = "";
  (chat.memberIds || []).forEach((uid) => {
    const profile = chat.memberProfiles && chat.memberProfiles[uid];
    const row = document.createElement("div");
    row.className = "participant-row";

    const avatar = document.createElement("img");
    avatar.className = "participant-avatar";
    avatar.alt = "";
    if (profile) avatar.src = resolveAvatarSrc(profile.avatar);
    row.appendChild(avatar);

    const name = document.createElement("span");
    name.className = "participant-name";
    name.textContent = profile ? profile.name : "…";
    if (uid === myUid) {
      const you = document.createElement("span");
      you.className = "participant-you";
      you.textContent = " (você)";
      name.appendChild(you);
    }
    row.appendChild(name);

    participantsList.appendChild(row);
  });
  participantsModal.classList.remove("hidden");
});

btnCloseParticipants.addEventListener("click", () => participantsModal.classList.add("hidden"));
participantsModal.addEventListener("click", (e) => {
  if (e.target === participantsModal) participantsModal.classList.add("hidden");
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

// ---------- mensagens (cifradas) ----------

function subscribeToMessages(chatId) {
  if (unsubMessages) unsubMessages();
  messagesEl.innerHTML = "";
  renderedMessageIds = new Set();
  messageRows.clear();

  const q = query(collection(db, "chats", chatId, "messages"), orderBy("ts"));
  unsubMessages = onSnapshot(
    q,
    async (snap) => {
      for (const change of snap.docChanges()) {
        const data = change.doc.data();
        if (change.type === "added") {
          if (renderedMessageIds.has(change.doc.id)) continue;
          renderedMessageIds.add(change.doc.id);
          await renderMessage(change.doc.id, data);
          markAsReadIfNeeded(chatId, change.doc.id, data);
        } else if (change.type === "modified") {
          updateMessageTicks(change.doc.id, data);
        } else if (change.type === "removed") {
          const entry = messageRows.get(change.doc.id);
          if (entry) entry.row.remove();
          messageRows.delete(change.doc.id);
          renderedMessageIds.delete(change.doc.id);
        }
      }
    },
    (err) => showAppError("Erro nas mensagens: " + err.message)
  );
}

function markAsReadIfNeeded(chatId, messageId, data) {
  if (data.senderId === myUid) return;
  if ((data.readBy || []).includes(myUid)) return;
  updateDoc(doc(db, "chats", chatId, "messages", messageId), {
    readBy: arrayUnion(myUid),
    [`readAt.${myUid}`]: Date.now(),
  }).catch(() => {});
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function isReadByOthers(chat, readBy) {
  if (!chat || !readBy) return false;
  const others = (chat.memberIds || []).filter((id) => id !== myUid);
  return others.some((id) => readBy.includes(id));
}

function readTooltip(chat, readAt) {
  if (!chat || !readAt) return "Enviada";
  const others = (chat.memberIds || []).filter((id) => id !== myUid);
  const times = others.map((id) => readAt[id]).filter(Boolean);
  if (!times.length) return "Enviada, ainda não vista";
  return "Visto às " + formatTime(Math.max(...times));
}

async function renderMessage(id, data) {
  const isMe = data.senderId === myUid;
  const chat = chats.get(activeChatId);

  const row = document.createElement("div");
  row.className = "message-row " + (isMe ? "row-me" : "row-them");

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
  textNode.textContent = await decryptMessageText(chat, data);
  bubble.appendChild(textNode);

  const time = document.createElement("span");
  time.className = "bubble-time";
  time.textContent = formatTime(data.ts);
  bubble.appendChild(time);

  let ticksEl = null;
  if (isMe) {
    ticksEl = document.createElement("span");
    ticksEl.className = "msg-ticks";
    ticksEl.textContent = "✓✓";
    ticksEl.title = readTooltip(chat, data.readAt);
    if (isReadByOthers(chat, data.readBy)) ticksEl.classList.add("read");
    time.appendChild(ticksEl);
  }

  col.appendChild(bubble);
  row.appendChild(col);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  messageRows.set(id, { row, ticksEl, data });
}

async function decryptMessageText(chat, data) {
  if (!data.ciphertext) return data.text || "";
  const key = await getChatKey(chat);
  if (!key) return "🔒 (sem chave de criptografia ainda)";
  try {
    return await decryptText(key, data.ciphertext, data.iv);
  } catch (e) {
    return "🔒 (não foi possível decifrar)";
  }
}

function updateMessageTicks(id, data) {
  const entry = messageRows.get(id);
  if (!entry) return;
  entry.data = data;
  if (!entry.ticksEl) return;
  const chat = chats.get(activeChatId);
  entry.ticksEl.classList.toggle("read", isReadByOthers(chat, data.readBy));
  entry.ticksEl.title = readTooltip(chat, data.readAt);
}

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !activeChatId) return;

  const chat = chats.get(activeChatId);
  const key = await getChatKey(chat);
  if (!key) {
    showAppError("Ainda não foi possível estabelecer a chave de criptografia desta conversa. Tente de novo em instantes.");
    return;
  }

  messageInput.value = "";
  const ts = Date.now();
  const chatRef = doc(db, "chats", activeChatId);
  try {
    const { ciphertext, iv } = await encryptText(key, text);
    await addDoc(collection(chatRef, "messages"), {
      senderId: myUid,
      senderName: myProfile.name,
      ciphertext,
      iv,
      ts,
      readBy: [],
      readAt: {},
    });
    await updateDoc(chatRef, { lastMessage: { ciphertext, iv, senderName: myProfile.name, ts } });
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
    participantsModal.classList.add("hidden");
    chatMenu.classList.add("hidden");
  }
});

buildColorSwatches();
applyAppearance();
