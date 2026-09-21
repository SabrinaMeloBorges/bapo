import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  linkWithPopup,
  signInWithCredential,
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
  deleteDoc,
  query,
  where,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  increment,
  deleteField,
  orderBy,
  limitToLast,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig, USE_EMULATOR } from "./firebase-config.js";
import { GIPHY_API_KEY } from "./gif-config.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem O/0/I/1 pra evitar confusão

const AVATAR_SEEDS = ["Felix", "Aneka", "Milo", "Zoe", "Leo", "Nala", "Max", "Luna", "Coco", "Ivy", "Rex", "Mia"];
const AVATAR_STYLE = "adventurer";

const GROUP_ICON_STYLE = "icons"; // estilo antigo, mantido pra grupos criados antes
const GROUP_ICON_BACKGROUNDS = "f6c89f,f4a09c,f7d08a,a8d5b5,9ec7e8,c9b6e4,e9b7ce,bfd8bd";
const GROUP_ICON_PRESETS = [
  "shapes:Girassol",
  "shapes:Vitrola",
  "shapes:Cactos",
  "shapes:Fliperama",
  "rings:Saturno",
  "rings:Disco",
  "rings:Vinil",
  "fun-emoji:Pipoca",
  "fun-emoji:Festa",
  "fun-emoji:Turma",
  "thumbs:Galera",
  "bottts-neutral:Radinho",
  "bottts-neutral:Fita",
];

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
const TYPING_TTL_MS = 4000;
const TYPING_WRITE_THROTTLE_MS = 2000;
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

// Em produção o service worker guarda o "app shell" pra abrir offline. Rodando
// local ele só atrapalha (serve arquivo velho enquanto você edita), então fica
// desligado e qualquer registro antigo é removido.
const IS_LOCAL_HOST = ["localhost", "127.0.0.1"].includes(location.hostname);

if ("serviceWorker" in navigator) {
  if (IS_LOCAL_HOST) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
    if (window.caches) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
  } else {
    const hadController = !!navigator.serviceWorker.controller;
    let reloadedForUpdate = false;

    // Quando um service worker novo assume, recarrega uma vez: garante que
    // HTML, CSS e JS sejam sempre da mesma versão (senão dá pra ficar com um
    // arquivo velho em cache e o layout quebrar).
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloadedForUpdate) return;
      reloadedForUpdate = true;
      location.reload();
    });

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js")
        .then((reg) => reg.update())
        .catch(() => {});
    });
  }
}

const el = (id) => document.getElementById(id);

// Um avatar pessoal pode ser um "seed" (ilustração gerada) ou uma foto
// enviada pelo usuário, guardada como data URL (base64) direto no perfil.
function resolveAvatarSrc(value) {
  if (!value) return "";
  if (value.startsWith("data:image")) return value;
  return `https://api.dicebear.com/9.x/${AVATAR_STYLE}/svg?seed=${encodeURIComponent(value)}&size=80`;
}

// O ícone de um grupo pode ser um preset ("estilo:semente"), uma semente
// antiga (só o texto, do estilo "icons") ou uma foto enviada (data URL).
function groupIconUrl(value) {
  const icon = value || GROUP_ICON_PRESETS[0];
  if (icon.startsWith("data:image")) return icon;
  const [style, seed] = icon.includes(":") ? icon.split(":") : [GROUP_ICON_STYLE, icon];
  return (
    `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}` +
    `&size=96&backgroundColor=${GROUP_ICON_BACKGROUNDS}&backgroundType=gradientLinear`
  );
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

const STICKER_MAX_SIZE = 200; // px, mantém o arquivo pequeno o bastante pra caber num documento do Firestore
const STICKER_MAX_BYTES = 700 * 1024; // limite de segurança bem abaixo de 1 MiB (limite de um documento)

// WebP guarda transparência e costuma ocupar bem menos que PNG; se o navegador
// não suportar (ou o PNG sair menor), usa PNG mesmo.
function toSmallestImageDataUrl(canvas) {
  const png = canvas.toDataURL("image/png");
  try {
    const webp = canvas.toDataURL("image/webp", 0.92);
    if (webp.startsWith("data:image/webp") && webp.length < png.length) return webp;
  } catch (e) {}
  return png;
}

// Diferente da foto de perfil (recortada em quadrado, JPEG): figurinha
// preserva a proporção original e o fundo transparente, sem recortar.
function resizeStickerFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, STICKER_MAX_SIZE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = toSmallestImageDataUrl(canvas);
        if (dataUrl.length > STICKER_MAX_BYTES) {
          reject(new Error("Essa imagem ficou grande demais mesmo depois de reduzida. Tente uma mais simples."));
          return;
        }
        resolve(dataUrl);
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
// Cada conversa (individual ou em grupo) tem uma chave AES-256 própria,
// gerada na criação e guardada no documento do chat. Quem protege essa
// chave são as regras do Firestore (só quem já é membro consegue ler o
// documento) — não o sigilo por trás de matemática de par de chaves por
// aparelho. A vantagem: a mesma conversa abre normalmente em qualquer
// aparelho onde você estiver logado, como em outros apps de mensagens,
// sem precisar que os dois lados "sincronizem" uma chave por par de
// dispositivos primeiro.

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

async function generateSharedKeyRaw() {
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
    let raw = chat.encKeyRaw;
    if (!raw) {
      // conversa individual criada antes desta atualização (usava uma chave
      // por par de aparelhos): gera a chave compartilhada agora, pra essa
      // conversa passar a abrir normalmente em qualquer aparelho a partir daqui.
      raw = await generateSharedKeyRaw();
      await updateDoc(doc(db, "chats", chat.id), { encKeyRaw: raw });
    }
    const key = await crypto.subtle.importKey("raw", b64ToBuf(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
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
  if (lastMessage.kind === "sticker") return prefix + "🖼️ Figurinha";
  if (lastMessage.kind === "gif") return prefix + "GIF";
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
  return { name: myProfile.name, avatar: myProfile.avatar };
}

// ---------- elementos ----------

const screenAuth = el("screen-auth");
const btnToggleEmailAuth = el("btn-toggle-email-auth");
const emailAuthFields = el("email-auth-fields");
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
const chatStatusDot = el("chat-status-dot");
const chatTitleEl = el("chat-title");
const chatSubtitleEl = el("chat-subtitle");
const btnChatMenu = el("btn-chat-menu");
const chatMenu = el("chat-menu");
const participantsModal = el("participants-modal");
const participantsList = el("participants-list");
const btnCloseParticipants = el("btn-close-participants");
const btnChatInvite = el("btn-chat-invite");
const btnToggleEphemeral = el("btn-toggle-ephemeral");
const ephemeralStateEl = el("ephemeral-state");
const ephemeralIcon = el("ephemeral-icon");
const btnClearChat = el("btn-clear-chat");
const btnLeave = el("btn-leave");
const inviteBanner = el("invite-banner");
const inviteBannerCode = el("invite-banner-code");
const btnInviteBannerCopy = el("btn-invite-banner-copy");

const messagesEl = el("messages");
const typingIndicator = el("typing-indicator");
const messageForm = el("message-form");
const messageInput = el("message-input");
const btnSend = el("btn-send");
const replyPreview = el("reply-preview");
const replyPreviewName = el("reply-preview-name");
const replyPreviewBody = el("reply-preview-body");
const btnCancelReply = el("btn-cancel-reply");

const btnAttach = el("btn-attach");
const attachPanel = el("attach-panel");
const attachTabs = el("attach-tabs");
const tabStickersPanel = el("tab-stickers");
const tabGifsPanel = el("tab-gifs");
const stickerGrid = el("sticker-grid");
const btnAddSticker = el("btn-add-sticker");
const stickerFileInput = el("sticker-file-input");
const gifSearchInput = el("gif-search-input");
const gifResults = el("gif-results");
const gifHint = el("gif-hint");

const appError = el("app-error");

const chatSearchInput = el("chat-search");
const btnClearSearch = el("btn-clear-search");
const chatFilters = el("chat-filters");
const btnNavChats = el("btn-nav-chats");
const btnNavSearch = el("btn-nav-search");
const btnNavNew = el("btn-nav-new");
const navChatsBadge = el("nav-chats-badge");
const btnEmptyNewChat = el("btn-empty-new-chat");
const btnArchiveChat = el("btn-archive-chat");

const btnChatInfo = el("btn-chat-info");
const chatInfoAvatar = el("chat-info-avatar");
const chatInfoTitle = el("chat-info-title");
const chatInfoSubtitle = el("chat-info-subtitle");
const chatInfoEdit = el("chat-info-edit");
const chatInfoNameInput = el("chat-info-name");
const chatInfoIconGrid = el("chat-info-icon-grid");
const btnChatInfoPhoto = el("btn-chat-info-photo");
const chatInfoFile = el("chat-info-file");
const btnSaveChatInfo = el("btn-save-chat-info");
const chatInfoCode = el("chat-info-code");
const btnChatInfoCopy = el("btn-chat-info-copy");
const chatInfoError = el("chat-info-error");
const groupIconFile = el("group-icon-file");

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

const notifToastCheckbox = el("notif-toast");
const notifSoundCheckbox = el("notif-sound");
const notifSoundTypeSelect = el("notif-sound-type");
const notifBrowserCheckbox = el("notif-browser");
const toastContainer = el("toast-container");

// ---------- estado ----------

let myProfile = null;
let myUid = null;
let pendingInvite = null;
let selectedAvatarSeed = AVATAR_SEEDS[0];
let selectedGroupIcon = GROUP_ICON_PRESETS[0];
let myStickers = [];
let gifSearchDebounce = null;

const chats = new Map();
let activeChatId = null;
let unsubChatList = null;
let unsubMessages = null;
let renderedMessageIds = new Set();
const messageRows = new Map(); // messageId -> { row, ticksEl, data }
const decryptedTextCache = new Map(); // messageId -> texto já decifrado (só em memória, enquanto o chat está aberto)
let replyingTo = null; // { messageId, senderName }

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

btnToggleEmailAuth.addEventListener("click", () => {
  const showing = !emailAuthFields.classList.contains("hidden");
  emailAuthFields.classList.toggle("hidden", showing);
  btnToggleEmailAuth.textContent = showing ? "Continuar com e-mail" : "‹ Voltar";
  if (!showing) authEmailInput.focus();
});

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
  const oldUid = myUid;
  try {
    await linkWithPopup(auth.currentUser, new GoogleAuthProvider());
    btnLinkGoogle.classList.add("hidden");
    btnLogout.classList.remove("hidden");
    if (myProfile) await saveProfile(myProfile); // agora sincroniza em users/{uid}
    window.alert("Conta Google vinculada! Suas conversas continuam exatamente como estavam, e agora dá pra entrar com essa conta em qualquer aparelho.");
  } catch (err) {
    if (err.code === "auth/credential-already-in-use") {
      const merge = window.confirm(
        "Essa conta Google já tem um perfil no bapo (usado em outro aparelho). " +
          "Quer continuar mesmo assim? As conversas deste aparelho serão somadas às que essa conta já tem — nada é apagado, e você não precisa se desconectar de lugar nenhum."
      );
      if (!merge) return;
      try {
        // precisa buscar as conversas ANTES de trocar de conta: depois de
        // trocar, as regras de segurança corretamente bloqueiam a leitura de
        // conversas onde a conta nova ainda não é membro.
        const chatsToMigrate = await findChatsForUid(oldUid);
        const credential = GoogleAuthProvider.credentialFromError(err);
        await signInWithCredential(auth, credential);
        const newUid = auth.currentUser.uid;
        await migrateUidInChats(oldUid, newUid, chatsToMigrate);
        myUid = newUid;
        const profile = await loadProfile();
        if (profile) {
          myProfile = profile;
          updateProfileChip();
        }
        btnLinkGoogle.classList.add("hidden");
        btnLogout.classList.remove("hidden");
        subscribeToChatList();
        window.alert("Pronto! As conversas deste aparelho agora fazem parte da sua conta Google, junto com as que já existiam.");
      } catch (mergeErr) {
        window.alert("Não foi possível concluir: " + mergeErr.message);
      }
    } else if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
      window.alert("Não foi possível vincular: " + describeAuthError(err));
    }
  }
});

async function findChatsForUid(uid) {
  const q = query(collection(db, "chats"), where("memberIds", "array-contains", uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() }));
}

// Transfere a titularidade das conversas de um uid antigo (ex: sessão anônima
// deste aparelho) para um uid novo (a conta Google que já existia), sem
// perder nenhuma mensagem — só troca quem é "dono" de cada uma. `chatsList`
// precisa ter sido buscado ENQUANTO ainda autenticado como oldUid (ver
// findChatsForUid) — depois de trocar de conta as regras já não deixam mais
// ler essas conversas antigas por essa rota.
async function migrateUidInChats(oldUid, newUid, chatsList) {
  for (const chatDoc of chatsList) {
    const data = chatDoc.data;
    const newMemberIds = (data.memberIds || []).map((id) => (id === oldUid ? newUid : id));

    const swapKey = (obj) => {
      if (!obj || obj[oldUid] === undefined) return obj || {};
      const copy = { ...obj };
      copy[newUid] = copy[oldUid];
      delete copy[oldUid];
      return copy;
    };

    const update = {
      memberIds: newMemberIds,
      memberProfiles: swapKey(data.memberProfiles),
      unreadCount: swapKey(data.unreadCount),
      typing: swapKey(data.typing),
    };
    if (data.lastMessage && data.lastMessage.senderId === oldUid) {
      update["lastMessage.senderId"] = newUid;
    }
    await updateDoc(chatDoc.ref, update);

    const msgsSnap = await getDocs(query(collection(db, "chats", chatDoc.id, "messages"), where("senderId", "==", oldUid)));
    if (!msgsSnap.empty) {
      const batch = writeBatch(db);
      msgsSnap.forEach((m) => {
        const readBy = (m.data().readBy || []).map((id) => (id === oldUid ? newUid : id));
        const readAt = swapKey(m.data().readAt);
        batch.update(m.ref, { senderId: newUid, readBy, readAt });
      });
      await batch.commit();
    }
  }
}

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

// ---------- figurinhas próprias ----------
//
// Ficam guardadas no IndexedDB deste aparelho (aguenta bem mais que o
// localStorage, que estourava a cota e perdia a coleção ao recarregar). Quem
// entra com e-mail/Google também tem uma cópia no Firestore, uma figurinha por
// documento, pra sincronizar entre aparelhos.

const STICKER_DB_NAME = "bapo-stickers-db";
const STICKER_STORE = "stickers";

function openStickerDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Este navegador não guarda figurinhas."));
      return;
    }
    const req = indexedDB.open(STICKER_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STICKER_STORE)) {
        database.createObjectStore(STICKER_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Não foi possível abrir o armazenamento local."));
  });
}

function stickerTx(mode, run) {
  return openStickerDb().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction(STICKER_STORE, mode);
        const store = tx.objectStore(STICKER_STORE);
        const req = run(store);
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error || new Error("Não foi possível salvar a figurinha."));
        tx.onabort = () => reject(tx.error || new Error("Não foi possível salvar a figurinha."));
      })
  );
}

const localStickers = {
  all: () => stickerTx("readonly", (store) => store.getAll()).then((list) => list || []),
  put: (item) => stickerTx("readwrite", (store) => store.put(item)),
  remove: (id) => stickerTx("readwrite", (store) => store.delete(id)),
};

function newStickerId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isSyncedUser() {
  return !!(auth.currentUser && !auth.currentUser.isAnonymous);
}

function cloudStickersRef() {
  return collection(db, "stickers", myUid, "items");
}

// Traz o que estava no formato antigo (lista única no localStorage ou num só
// documento do Firestore) pro novo formato, uma vez só.
async function migrateOldStickers(existing) {
  const known = new Set(existing.map((s) => s.dataUrl));
  const imported = [];

  try {
    const raw = localStorage.getItem("bapo-stickers");
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      parsed.forEach((dataUrl) => {
        if (typeof dataUrl === "string" && dataUrl.startsWith("data:image") && !known.has(dataUrl)) {
          known.add(dataUrl);
          imported.push({ id: newStickerId(), dataUrl, createdAt: Date.now() });
        }
      });
    }
  } catch (e) {}

  if (isSyncedUser()) {
    try {
      const snap = await getDoc(doc(db, "stickers", myUid));
      const list = snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
      list.forEach((dataUrl) => {
        if (typeof dataUrl === "string" && dataUrl.startsWith("data:image") && !known.has(dataUrl)) {
          known.add(dataUrl);
          imported.push({ id: newStickerId(), dataUrl, createdAt: Date.now() });
        }
      });
    } catch (e) {}
  }

  for (const item of imported) {
    try {
      await localStickers.put(item);
    } catch (e) {}
  }

  if (imported.length) {
    try {
      localStorage.removeItem("bapo-stickers");
    } catch (e) {}
  }

  return imported;
}

async function syncStickersWithCloud(local) {
  if (!isSyncedUser()) return local;

  let cloud = [];
  try {
    const snap = await getDocs(cloudStickersRef());
    snap.forEach((d) => {
      const data = d.data();
      if (data && typeof data.dataUrl === "string") {
        cloud.push({ id: d.id, dataUrl: data.dataUrl, createdAt: data.createdAt || 0 });
      }
    });
  } catch (e) {
    return local; // sem permissão/rede: segue com o que tem no aparelho
  }

  const localIds = new Set(local.map((s) => s.id));
  const cloudIds = new Set(cloud.map((s) => s.id));
  const merged = [...local];

  for (const item of cloud) {
    if (localIds.has(item.id)) continue;
    merged.push(item);
    try {
      await localStickers.put(item);
    } catch (e) {}
  }

  for (const item of local) {
    if (cloudIds.has(item.id)) continue;
    try {
      await setDoc(doc(db, "stickers", myUid, "items", item.id), {
        dataUrl: item.dataUrl,
        createdAt: item.createdAt || Date.now(),
      });
    } catch (e) {}
  }

  return merged;
}

async function loadStickers() {
  let local = [];
  try {
    local = await localStickers.all();
  } catch (e) {
    local = [];
  }

  const imported = await migrateOldStickers(local);
  const all = await syncStickersWithCloud([...local, ...imported]);

  return all.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

async function addSticker(dataUrl) {
  const item = { id: newStickerId(), dataUrl, createdAt: Date.now() };
  myStickers = [...myStickers, item];

  try {
    await localStickers.put(item);
  } catch (e) {
    // sem armazenamento local (aba anônima, por exemplo): a figurinha vale
    // só enquanto a aba estiver aberta
    showAppError("A figurinha foi adicionada, mas este navegador não consegue guardá-la pra depois.");
  }

  if (isSyncedUser()) {
    try {
      await setDoc(doc(db, "stickers", myUid, "items", item.id), {
        dataUrl: item.dataUrl,
        createdAt: item.createdAt,
      });
    } catch (e) {}
  }
  return item;
}

async function removeSticker(id) {
  myStickers = myStickers.filter((s) => s.id !== id);
  try {
    await localStickers.remove(id);
  } catch (e) {}
  if (isSyncedUser()) {
    try {
      await deleteDoc(doc(db, "stickers", myUid, "items", id));
    } catch (e) {}
  }
}

function renderStickerGrid() {
  [...stickerGrid.querySelectorAll(".sticker-thumb")].forEach((el) => el.remove());
  myStickers.forEach((sticker) => {
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "sticker-thumb";
    thumb.title = "Enviar figurinha";

    const img = document.createElement("img");
    img.src = sticker.dataUrl;
    img.alt = "";
    thumb.appendChild(img);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-remove-sticker";
    removeBtn.title = "Remover figurinha";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await removeSticker(sticker.id);
      renderStickerGrid();
    });
    thumb.appendChild(removeBtn);

    thumb.addEventListener("click", async () => {
      attachPanel.classList.add("hidden");
      await sendChatMessage(sticker.dataUrl, "sticker");
    });

    stickerGrid.insertBefore(thumb, btnAddSticker);
  });
}

btnAddSticker.addEventListener("click", () => stickerFileInput.click());

stickerFileInput.addEventListener("change", async () => {
  const file = stickerFileInput.files[0];
  stickerFileInput.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    window.alert("Escolha um arquivo de imagem.");
    return;
  }
  try {
    const dataUrl = await resizeStickerFile(file);
    await addSticker(dataUrl);
    renderStickerGrid();
  } catch (err) {
    window.alert(err.message);
  }
});

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

// Monta uma grade de ícones de grupo (presets + a foto enviada, quando houver).
// Devolve uma função pra marcar visualmente qual está escolhido.
function buildIconGrid(container, current, onSelect) {
  container.innerHTML = "";
  const options = [...GROUP_ICON_PRESETS];
  if (current && !options.includes(current)) options.unshift(current);

  const markSelected = (value) => {
    [...container.children].forEach((c) => c.classList.toggle("selected", c.dataset.icon === value));
  };

  options.forEach((value, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "avatar-option";
    btn.dataset.icon = value;
    btn.setAttribute("aria-label", "Ícone " + (i + 1));

    const img = document.createElement("img");
    img.src = groupIconUrl(value);
    img.alt = "";
    btn.appendChild(img);

    btn.addEventListener("click", () => {
      markSelected(value);
      onSelect(value);
    });

    container.appendChild(btn);
  });

  markSelected(current);
  return markSelected;
}

let markGroupIconSelected = () => {};

function buildGroupIconGrid(current) {
  selectedGroupIcon = current || GROUP_ICON_PRESETS[0];
  markGroupIconSelected = buildIconGrid(groupIconGrid, selectedGroupIcon, (value) => {
    selectedGroupIcon = value;
  });

  const upload = document.createElement("button");
  upload.type = "button";
  upload.className = "avatar-option avatar-upload-tile";
  upload.title = "Enviar uma foto do computador";
  upload.innerHTML = "<span>+</span>";
  upload.addEventListener("click", () => groupIconFile.click());
  groupIconGrid.appendChild(upload);
}

groupIconFile.addEventListener("change", async () => {
  const file = groupIconFile.files && groupIconFile.files[0];
  groupIconFile.value = "";
  if (!file) return;
  try {
    buildGroupIconGrid(await resizeImageFile(file, 128, 0.72));
  } catch (err) {
    showModalError(err.message);
  }
});

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
  const profile = { name, avatar: selectedAvatarSeed };
  const isEdit = !!myProfile;
  await saveProfile(profile);
  updateProfileChip();
  if (isEdit) {
    propagateProfileToChats(profile).catch(() => {});
    screenProfile.classList.add("hidden");
    screenApp.classList.remove("hidden");
    settingsFab.classList.add("hidden");
    btnProfileContinue.disabled = false;
  } else {
    screenProfile.classList.add("hidden");
    enterApp();
  }
});

// Quando o nome/foto muda, atualiza na hora em toda conversa que a pessoa já
// participa — quem estiver com o chat aberto vê a mudança em tempo real,
// porque já está ouvindo esse mesmo documento (subscribeToChatList).
async function propagateProfileToChats(profile) {
  if (!myUid) return;
  const q = query(collection(db, "chats"), where("memberIds", "array-contains", myUid));
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.forEach((d) => {
    const existing = (d.data().memberProfiles && d.data().memberProfiles[myUid]) || {};
    batch.update(d.ref, { [`memberProfiles.${myUid}`]: { ...existing, name: profile.name, avatar: profile.avatar } });
  });
  await batch.commit();
}

btnEditProfile.addEventListener("click", () => {
  showProfileScreen(myProfile);
});

// ---------- app principal ----------

async function boot() {
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
  loadStickers().then((list) => {
    myStickers = list;
    renderStickerGrid();
  });
  if (!presenceRenderInterval) {
    // roda rápido (é só cálculo local) pra "digitando…" sumir sem demora perceptível
    presenceRenderInterval = setInterval(renderPeerPresence, 1500);
  }
  if (pendingInvite) {
    const code = pendingInvite;
    pendingInvite = null;
    await handleJoinByCode(code, { auto: true });
  }
}

const lastSeenMsgTs = new Map(); // chatId -> ts do último lastMessage já visto/notificado
let chatListBooted = false;

function subscribeToChatList() {
  if (unsubChatList) unsubChatList();
  const q = query(collection(db, "chats"), where("memberIds", "array-contains", myUid));
  unsubChatList = onSnapshot(
    q,
    (snap) => {
      chats.clear();
      snap.forEach((d) => chats.set(d.id, { id: d.id, ...d.data() }));

      if (!chatListBooted) {
        // primeira carga: só estabelece a linha de base, não notifica nada retroativo
        chats.forEach((c) => lastSeenMsgTs.set(c.id, c.lastMessage ? c.lastMessage.ts : 0));
        chatListBooted = true;
      } else {
        chats.forEach((c) => {
          const prevTs = lastSeenMsgTs.get(c.id) || 0;
          const newTs = c.lastMessage ? c.lastMessage.ts : 0;
          if (newTs > prevTs) maybeNotify(c);
          lastSeenMsgTs.set(c.id, newTs);
        });
      }

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
      avatarSrc: groupIconUrl(chat.icon),
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

let chatFilter = "all";
let chatSearchTerm = "";

function getArchivedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem("bapo-archived") || "[]"));
  } catch (e) {
    return new Set();
  }
}

function isArchived(chatId) {
  return getArchivedIds().has(chatId);
}

function setArchived(chatId, archived) {
  const ids = getArchivedIds();
  if (archived) ids.add(chatId);
  else ids.delete(chatId);
  try {
    localStorage.setItem("bapo-archived", JSON.stringify([...ids]));
  } catch (e) {}
}

function emptyListMessage() {
  if (chatSearchTerm) return "Nenhuma conversa encontrada para essa busca.";
  if (chatFilter === "unread") return "Nenhuma conversa não lida por aqui.";
  if (chatFilter === "archived") return "Nenhuma conversa arquivada.";
  return "Nenhuma conversa ainda. Toque em “+” pra começar.";
}

function renderChatList() {
  const archived = getArchivedIds();
  const list = [...chats.values()]
    .filter((chat) => {
      const unread = (chat.unreadCount && chat.unreadCount[myUid]) || 0;
      if (chatFilter === "archived" && !archived.has(chat.id)) return false;
      if (chatFilter !== "archived" && archived.has(chat.id)) return false;
      if (chatFilter === "unread" && unread === 0) return false;
      if (chatSearchTerm) {
        const name = (chatDisplayInfo(chat).name || "").toLowerCase();
        if (!name.includes(chatSearchTerm)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const ta = (a.lastMessage && a.lastMessage.ts) || a.createdAt || 0;
      const tb = (b.lastMessage && b.lastMessage.ts) || b.createdAt || 0;
      return tb - ta;
    });

  chatListEmpty.textContent = emptyListMessage();
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

    const unreadCount = (chat.unreadCount && chat.unreadCount[myUid]) || 0;

    const preview = document.createElement("p");
    preview.className = "chat-item-preview" + (unreadCount > 0 ? " unread" : "");
    preview.textContent = "…";
    decryptPreview(chat, chat.lastMessage).then((text) => {
      preview.textContent = text;
    });
    col.appendChild(preview);

    item.appendChild(col);

    if (unreadCount > 0) {
      const badge = document.createElement("span");
      badge.className = "chat-item-badge";
      badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
      item.appendChild(badge);
    }

    item.addEventListener("click", () => openChat(chat.id));
    chatListEl.appendChild(item);
  });

  updateTitleBadge();
}

function updateTitleBadge() {
  const total = [...chats.values()].reduce((sum, c) => sum + ((c.unreadCount && c.unreadCount[myUid]) || 0), 0);
  document.title = total > 0 ? `(${total > 99 ? "99+" : total}) bapo` : "bapo — conversas e grupos em tempo real";
  navChatsBadge.textContent = total > 99 ? "99+" : String(total);
  navChatsBadge.classList.toggle("hidden", total === 0);
}

function markChatAsRead(chatId, chat) {
  if (!chat || !chat.unreadCount || !chat.unreadCount[myUid]) return;
  updateDoc(doc(db, "chats", chatId), { [`unreadCount.${myUid}`]: 0 }).catch(() => {});
}

function openChat(chatId) {
  activeChatId = chatId;
  chatMenu.classList.add("hidden");
  attachPanel.classList.add("hidden");
  emptyState.classList.add("hidden");
  activeChatEl.classList.remove("hidden");
  screenApp.classList.add("showing-chat");
  messageInput.disabled = false;
  btnSend.disabled = false;
  const chat = chats.get(chatId);
  updateActiveChatHeader(chat);
  subscribeToMessages(chatId);
  markChatAsRead(chatId, chat);
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
    setMenuItemText(btnLeave, "Sair do grupo");
    btnLeave.title = "Sair do grupo";
    chatStatusDot.classList.add("hidden"); // sem presença individual em grupos
  } else {
    setMenuItemText(btnLeave, "Apagar contato");
    btnLeave.title = "Apagar esse contato";
    if (memberCount < 2) {
      chatSubtitleEl.textContent = "";
      chatStatusDot.classList.add("hidden");
    }
  }

  const waitingForPeer = memberCount < 2;
  inviteBanner.classList.toggle("hidden", !waitingForPeer);
  if (waitingForPeer) inviteBannerCode.textContent = chat.inviteCode;
  messageInput.disabled = waitingForPeer;
  btnSend.disabled = waitingForPeer;

  ephemeralStateEl.textContent = chat.ephemeral ? "ativadas" : "desativadas";
  ephemeralIcon.classList.toggle("hidden", !chat.ephemeral);

  subscribePeerPresence(chat, info.otherUid);
  renderPeerPresence();
}

// ---------- criar / entrar em conversas ----------

async function createDirectChat(peer) {
  await authReady;
  const code = randomCode();
  const encKeyRaw = await generateSharedKeyRaw();
  const memberIds = [myUid];
  const memberProfiles = { [myUid]: myMemberProfile() };
  // quando a conversa nasce a partir da lista de participantes de um grupo,
  // já sabemos quem é a outra pessoa — ela entra como membro na hora, sem
  // precisar de código de convite.
  if (peer && peer.uid && peer.uid !== myUid) {
    memberIds.push(peer.uid);
    memberProfiles[peer.uid] = peer.profile || { name: "…", avatar: null };
  }
  const chatRef = await addDoc(collection(db, "chats"), {
    type: "direct",
    name: "",
    icon: null,
    inviteCode: code,
    encKeyRaw,
    ephemeral: false,
    memberIds,
    memberProfiles,
    createdAt: Date.now(),
    lastMessage: null,
  });
  await setDoc(doc(db, "invites", code), { chatId: chatRef.id, type: "direct" });
  return chatRef.id;
}

// procura uma conversa individual que já exista com essa pessoa
function findDirectChatWith(uid) {
  for (const chat of chats.values()) {
    if (chat.type !== "direct") continue;
    const ids = chat.memberIds || [];
    if (ids.length === 2 && ids.includes(uid) && ids.includes(myUid)) return chat.id;
  }
  return null;
}

// abre (ou cria) a conversa individual com um participante do grupo
async function openDirectChatWith(uid, profile) {
  const existing = findDirectChatWith(uid);
  if (existing) {
    participantsModal.classList.add("hidden");
    openChat(existing);
    return;
  }
  const chatId = await createDirectChat({ uid, profile });
  participantsModal.classList.add("hidden");
  openChat(chatId);
}

async function createGroupChat(name, icon) {
  await authReady;
  const code = randomCode();
  const encKeyRaw = await generateSharedKeyRaw();
  const chatRef = await addDoc(collection(db, "chats"), {
    type: "group",
    name,
    icon,
    inviteCode: code,
    encKeyRaw,
    ephemeral: false,
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

btnToggleEphemeral.addEventListener("click", async () => {
  if (!activeChatId) return;
  const chat = chats.get(activeChatId);
  if (!chat) return;
  const next = !chat.ephemeral;
  if (next && !confirm("Ativar mensagens temporárias? Mensagens com mais de 30 minutos vão ser apagadas automaticamente nesta conversa.")) return;
  try {
    await updateDoc(doc(db, "chats", activeChatId), { ephemeral: next });
  } catch (err) {
    showAppError("Erro ao alterar: " + err.message);
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
  // limpeza automática só roda nas conversas em que "mensagens temporárias"
  // foi ativado explicitamente — por padrão fica desligado, pra não sumir
  // mensagem de ninguém sem querer.
  chats.forEach((chat) => {
    if (chat.ephemeral) purgeOldMessages(chat.id).catch(() => {});
  });
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

let presenceHeartbeatStarted = false;

function startPresenceHeartbeat() {
  if (presenceHeartbeatStarted) return;
  presenceHeartbeatStarted = true;
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

function isTyping(chat, uid) {
  if (!chat || !chat.typing || !uid) return false;
  const ts = chat.typing[uid];
  return !!ts && Date.now() - ts < TYPING_TTL_MS;
}

function setStatusDot(state) {
  chatStatusDot.classList.remove("hidden", "online", "inactive", "hibernating");
  if (!state) {
    chatStatusDot.classList.add("hidden");
    return;
  }
  chatStatusDot.classList.add(state);
}

// Função "guarda-chuva" chamada sempre que algo pode ter mudado o texto
// abaixo do nome no cabeçalho: presença do outro membro, ou alguém
// digitando (em conversas individuais ou em grupos).
let lastDayKey = null;
let typingSignature = "";

// Aviso de "digitando" fixo no canto inferior esquerdo da conversa. Em grupo
// mostra a foto de quem está digitando (até três) e o nome embaixo.
function updateTypingBubble(chat) {
  const typers = chat
    ? (chat.memberIds || []).filter((uid) => uid !== myUid && isTyping(chat, uid))
    : [];

  const signature = (chat ? chat.id : "") + "|" + typers.join(",");
  if (signature === typingSignature) return;
  typingSignature = signature;

  if (!typers.length) {
    typingIndicator.classList.add("hidden");
    typingIndicator.innerHTML = "";
    return;
  }

  const isGroup = chat.type === "group";
  const profileOf = (uid) => (chat.memberProfiles && chat.memberProfiles[uid]) || null;

  typingIndicator.innerHTML = "";

  if (isGroup) {
    const avatars = document.createElement("div");
    avatars.className = "typing-avatars";
    typers.slice(0, 3).forEach((uid) => {
      const profile = profileOf(uid);
      const img = document.createElement("img");
      img.className = "typing-avatar";
      img.alt = profile ? profile.name : "";
      img.title = profile ? profile.name : "";
      if (profile) img.src = resolveAvatarSrc(profile.avatar);
      avatars.appendChild(img);
    });
    typingIndicator.appendChild(avatars);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble bubble-them typing-bubble";
  bubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
  typingIndicator.appendChild(bubble);

  if (isGroup) {
    const names = typers.map((uid) => (profileOf(uid) || {}).name || "alguém");
    const label = document.createElement("span");
    label.className = "typing-names";
    label.textContent =
      names.length === 1
        ? `${names[0]} está digitando…`
        : `${names.slice(0, 2).join(", ")}${names.length > 2 ? " e mais" : ""} estão digitando…`;
    typingIndicator.appendChild(label);
  }

  typingIndicator.classList.remove("hidden");
}

function renderPeerPresence() {
  const chat = chats.get(activeChatId);
  if (!chat) return;
  updateTypingBubble(chat);

  if (chat.type === "group") {
    const typers = (chat.memberIds || [])
      .filter((uid) => uid !== myUid && isTyping(chat, uid))
      .map((uid) => (chat.memberProfiles && chat.memberProfiles[uid] && chat.memberProfiles[uid].name) || "alguém");
    const memberCount = (chat.memberIds || []).length;
    chatSubtitleEl.textContent = typers.length
      ? typers.join(", ") + (typers.length === 1 ? " está digitando…" : " estão digitando…")
      : `${memberCount} participante${memberCount === 1 ? "" : "s"}`;
    return;
  }

  if ((chat.memberIds || []).length < 2) return;

  const otherUid = (chat.memberIds || []).find((id) => id !== myUid);
  if (isTyping(chat, otherUid)) {
    chatSubtitleEl.textContent = "digitando…";
    setStatusDot("online");
    return;
  }

  if (!lastPeerPresence) {
    chatSubtitleEl.textContent = "em hibernação";
    setStatusDot("hibernating");
    return;
  }
  const diff = Date.now() - lastPeerPresence.lastActiveAt;
  if (diff < PRESENCE_ONLINE_WINDOW_MS && lastPeerPresence.state === "online") {
    chatSubtitleEl.textContent = "online agora";
    setStatusDot("online");
  } else if (diff < PRESENCE_INACTIVE_WINDOW_MS) {
    chatSubtitleEl.textContent = "inativo";
    setStatusDot("inactive");
  } else {
    chatSubtitleEl.textContent = "visto por último às " + formatTime(lastPeerPresence.lastActiveAt);
    setStatusDot("hibernating");
  }
}

btnChatMenu.addEventListener("click", (e) => {
  e.stopPropagation();
  setMenuItemText(btnArchiveChat, activeChatId && isArchived(activeChatId) ? "Desarquivar conversa" : "Arquivar conversa");
  chatMenu.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (chatMenu.classList.contains("hidden")) return;
  if (chatMenu.contains(e.target) || btnChatMenu.contains(e.target)) return;
  chatMenu.classList.add("hidden");
});

[btnChatInvite, btnArchiveChat, btnToggleEphemeral, btnClearChat, btnLeave].forEach((b) => {
  b.addEventListener("click", () => chatMenu.classList.add("hidden"));
});

// ---------- informações da conversa (foto, nome, convite, participantes) ----------

function setMenuItemText(button, text) {
  const target = button.querySelector(".chat-menu-text");
  if (target) target.textContent = text;
  else button.textContent = text;
}

let chatInfoIconChoice = null;

function showChatInfoError(msg) {
  chatInfoError.textContent = msg;
  chatInfoError.classList.remove("hidden");
}

function renderParticipants(chat) {
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

    if (uid !== myUid) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "participant-action";
      btn.textContent = findDirectChatWith(uid) ? "Abrir conversa" : "Enviar mensagem";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          participantsModal.classList.add("hidden");
          await openDirectChatWith(uid, profile);
        } catch (err) {
          btn.disabled = false;
          showAppError("Não foi possível abrir a conversa: " + err.message);
        }
      });
      row.appendChild(btn);
    }

    participantsList.appendChild(row);
  });
}

function openChatInfo() {
  const chat = chats.get(activeChatId);
  if (!chat) return;
  const info = chatDisplayInfo(chat);
  const isGroup = chat.type === "group";
  const memberCount = (chat.memberIds || []).length;

  chatInfoError.classList.add("hidden");
  chatInfoAvatar.src = info.avatarSrc || "";
  chatInfoTitle.textContent = info.name;
  chatInfoSubtitle.textContent = isGroup
    ? `Grupo · ${memberCount} participante${memberCount === 1 ? "" : "s"}`
    : memberCount < 2
    ? "Conversa individual · aguardando alguém entrar"
    : "Conversa individual";

  chatInfoEdit.classList.toggle("hidden", !isGroup);
  btnChatInfoPhoto.classList.toggle("hidden", !isGroup);

  if (isGroup) {
    chatInfoNameInput.value = chat.name || "";
    chatInfoIconChoice = chat.icon || GROUP_ICON_PRESETS[0];
    buildIconGrid(chatInfoIconGrid, chatInfoIconChoice, (value) => {
      chatInfoIconChoice = value;
      chatInfoAvatar.src = groupIconUrl(value);
    });
  }

  chatInfoCode.textContent = chat.inviteCode || "——";
  renderParticipants(chat);
  participantsModal.classList.remove("hidden");
}

btnChatInfo.addEventListener("click", openChatInfo);

btnChatInfoPhoto.addEventListener("click", () => chatInfoFile.click());

chatInfoFile.addEventListener("change", async () => {
  const file = chatInfoFile.files && chatInfoFile.files[0];
  chatInfoFile.value = "";
  if (!file) return;
  try {
    const dataUrl = await resizeImageFile(file, 160, 0.75);
    chatInfoIconChoice = dataUrl;
    chatInfoAvatar.src = dataUrl;
    buildIconGrid(chatInfoIconGrid, dataUrl, (value) => {
      chatInfoIconChoice = value;
      chatInfoAvatar.src = groupIconUrl(value);
    });
  } catch (err) {
    showChatInfoError(err.message);
  }
});

btnSaveChatInfo.addEventListener("click", async () => {
  const chat = chats.get(activeChatId);
  if (!chat || chat.type !== "group") return;
  const name = chatInfoNameInput.value.trim();
  if (!name) {
    showChatInfoError("Dê um nome pro grupo.");
    return;
  }
  chatInfoError.classList.add("hidden");
  btnSaveChatInfo.disabled = true;
  try {
    await updateDoc(doc(db, "chats", chat.id), {
      name,
      icon: chatInfoIconChoice || chat.icon || GROUP_ICON_PRESETS[0],
    });
    participantsModal.classList.add("hidden");
  } catch (err) {
    showChatInfoError("Não foi possível salvar: " + err.message);
  } finally {
    btnSaveChatInfo.disabled = false;
  }
});

btnChatInfoCopy.addEventListener("click", async () => {
  const chat = chats.get(activeChatId);
  if (!chat) return;
  const link = buildInviteLink(chat.inviteCode);
  try {
    await navigator.clipboard.writeText(link);
    flashText(btnChatInfoCopy, "Link copiado!");
  } catch (e) {
    window.prompt("Copie o link do convite:", link);
  }
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
  const target = button.querySelector(".chat-menu-text") || button;
  const original = target.textContent;
  target.textContent = text;
  setTimeout(() => (target.textContent = original), 1500);
}

// ---------- mensagens (cifradas) ----------

// Abrir uma conversa carrega só as últimas mensagens; o resto vem sob demanda
// pelo botão "Ver mensagens anteriores". Sem isso, um histórico grande
// travava a tela toda vez que a conversa era aberta.
const MESSAGE_PAGE_SIZE = 120;
let messageWindow = MESSAGE_PAGE_SIZE;
let loadMoreBtn = null;
let scrollAnchorId = null;

function subscribeToMessages(chatId, opts = {}) {
  if (unsubMessages) unsubMessages();
  if (!opts.keepWindow) messageWindow = MESSAGE_PAGE_SIZE;
  messagesEl.innerHTML = "";
  loadMoreBtn = null;
  lastDayKey = null;
  typingSignature = "";
  typingIndicator.classList.add("hidden");
  typingIndicator.innerHTML = "";
  decryptedTextCache.clear();
  cancelReply();
  renderedMessageIds = new Set();
  messageRows.clear();

  const q = query(collection(db, "chats", chatId, "messages"), orderBy("ts"), limitToLast(messageWindow));
  unsubMessages = onSnapshot(
    q,
    async (snap) => {
      const added = [];

      for (const change of snap.docChanges()) {
        const data = change.doc.data();
        if (change.type === "added") {
          if (renderedMessageIds.has(change.doc.id)) continue;
          renderedMessageIds.add(change.doc.id);
          added.push({ id: change.doc.id, data });
        } else if (change.type === "modified") {
          updateMessageTicks(change.doc.id, data);
        } else if (change.type === "removed") {
          const entry = messageRows.get(change.doc.id);
          if (entry) entry.row.remove();
          messageRows.delete(change.doc.id);
          renderedMessageIds.delete(change.doc.id);
          pruneDayDividers();
        }
      }

      if (added.length) {
        await renderMessages(added);
        markAsReadInBatch(chatId, added);
        updateLoadMoreButton(chatId, snap.size);
      }
    },
    (err) => showAppError("Erro nas mensagens: " + err.message)
  );
}

// Mostra o botão de carregar mais só quando o histórico pode ter mais coisa
// do que a janela atual.
function updateLoadMoreButton(chatId, loadedCount) {
  const canHaveMore = loadedCount >= messageWindow;

  if (!canHaveMore) {
    if (loadMoreBtn) {
      loadMoreBtn.remove();
      loadMoreBtn = null;
    }
    return;
  }

  if (!loadMoreBtn) {
    loadMoreBtn = document.createElement("button");
    loadMoreBtn.type = "button";
    loadMoreBtn.className = "load-more-btn";
    loadMoreBtn.textContent = "Ver mensagens anteriores";
    loadMoreBtn.addEventListener("click", () => {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = "Carregando…";
      const oldest = [...messageRows.keys()][0];
      scrollAnchorId = oldest || null;
      messageWindow += MESSAGE_PAGE_SIZE;
      subscribeToMessages(chatId, { keepWindow: true });
    });
  }

  if (messagesEl.firstChild !== loadMoreBtn) messagesEl.insertBefore(loadMoreBtn, messagesEl.firstChild);
}

// Marcar como lida em lote: antes era uma escrita por mensagem, o que
// engasgava ao abrir uma conversa com muita coisa sem ler.
function markAsReadInBatch(chatId, entries) {
  const pending = entries.filter((e) => e.data.senderId !== myUid && !(e.data.readBy || []).includes(myUid));
  if (!pending.length) return;

  const now = Date.now();
  for (let i = 0; i < pending.length; i += 400) {
    const batch = writeBatch(db);
    pending.slice(i, i + 400).forEach((e) => {
      batch.update(doc(db, "chats", chatId, "messages", e.id), {
        readBy: arrayUnion(myUid),
        [`readAt.${myUid}`]: now,
      });
    });
    batch.commit().catch(() => {});
  }
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ---------- separadores de data entre as mensagens ----------

function dayKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function formatDayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const diffDays = Math.round((startOfDay(today) - startOfDay(d)) / 86400000);

  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  }
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(
    "pt-BR",
    sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" }
  );
}

function ensureDayDivider(ts, target) {
  const key = dayKeyOf(ts);
  if (key === lastDayKey) return;
  lastDayKey = key;

  const divider = document.createElement("div");
  divider.className = "day-divider";
  divider.dataset.day = key;
  const label = document.createElement("span");
  label.textContent = formatDayLabel(ts);
  divider.appendChild(label);
  (target || messagesEl).appendChild(divider);
}

// Depois que mensagens somem (limpeza ou mensagens temporárias), tira os
// separadores que ficaram sem nenhuma mensagem embaixo.
function pruneDayDividers() {
  const nodes = [...messagesEl.children];
  nodes.forEach((node, i) => {
    if (!node.classList.contains("day-divider")) return;
    let hasMessage = false;
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[j].classList.contains("day-divider")) break;
      if (nodes[j].classList.contains("message-row")) {
        hasMessage = true;
        break;
      }
    }
    if (!hasMessage) node.remove();
  });

  const remaining = [...messagesEl.children].filter((n) => n.classList.contains("day-divider"));
  lastDayKey = remaining.length ? remaining[remaining.length - 1].dataset.day : null;
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

// Decifra tudo em paralelo, monta as bolhas num fragmento e insere de uma vez
// só (antes era uma por uma, com rolagem forçada a cada mensagem).
async function renderMessages(entries) {
  const chat = chats.get(activeChatId);
  const contents = await Promise.all(entries.map((e) => decryptMessageText(chat, e.data)));

  entries.forEach((e, i) => {
    const kind = e.data.kind || "text";
    const content = contents[i];
    decryptedTextCache.set(e.id, kind === "sticker" ? "🖼️ Figurinha" : kind === "gif" ? "GIF" : content);
  });

  const frag = document.createDocumentFragment();
  entries.forEach((e, i) => {
    ensureDayDivider(e.data.ts, frag);
    frag.appendChild(renderMessage(e.id, e.data, contents[i], chat));
  });

  messagesEl.appendChild(frag);

  if (scrollAnchorId && messageRows.has(scrollAnchorId)) {
    messageRows.get(scrollAnchorId).row.scrollIntoView({ block: "start" });
    scrollAnchorId = null;
  } else {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

function renderMessage(id, data, content, chat) {
  const isMe = data.senderId === myUid;
  const kind = data.kind || "text";

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

  if (data.replyTo) {
    const quote = document.createElement("div");
    quote.className = "msg-quote";
    const quoteName = document.createElement("span");
    quoteName.className = "msg-quote-name";
    quoteName.textContent = data.replyTo.senderName;
    const quoteBody = document.createElement("span");
    quoteBody.className = "msg-quote-body";
    quoteBody.textContent = decryptedTextCache.get(data.replyTo.messageId) || "mensagem original não disponível";
    quote.appendChild(quoteName);
    quote.appendChild(quoteBody);
    quote.addEventListener("click", () => {
      const original = messageRows.get(data.replyTo.messageId);
      if (original) original.row.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    bubble.appendChild(quote);
  }

  const isValidMediaSrc = (kind === "sticker" || kind === "gif") && (content.startsWith("data:image") || content.startsWith("http"));
  let quoteLabel = content;

  if (isValidMediaSrc) {
    bubble.classList.add("bubble-media");
    const img = document.createElement("img");
    img.className = kind === "sticker" ? "sticker-img" : "gif-img";
    img.src = content;
    img.alt = kind === "sticker" ? "Figurinha" : "GIF";
    bubble.appendChild(img);
    quoteLabel = kind === "sticker" ? "🖼️ Figurinha" : "GIF";
  } else {
    const textNode = document.createElement("span");
    textNode.textContent = kind === "sticker" ? "🖼️ Figurinha" : kind === "gif" ? "GIF" : content;
    bubble.appendChild(textNode);
  }

  decryptedTextCache.set(id, quoteLabel);

  const time = document.createElement("span");
  time.className = "bubble-time" + (isValidMediaSrc ? " bubble-time-media" : "");
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

  const replyBtn = document.createElement("button");
  replyBtn.type = "button";
  replyBtn.className = "msg-reply-btn";
  replyBtn.title = "Responder";
  replyBtn.textContent = "↩";
  replyBtn.addEventListener("click", () => startReply(id, isMe ? "Você" : data.senderName, quoteLabel));

  col.appendChild(bubble);
  row.appendChild(col);
  row.appendChild(replyBtn);

  messageRows.set(id, { row, ticksEl, data });
  return row;
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

let lastTypingWriteAt = 0;

messageInput.addEventListener("input", () => {
  if (!activeChatId) return;
  const chat = chats.get(activeChatId);
  if (!chat || (chat.memberIds || []).length < 2) return;

  if (!messageInput.value) {
    // apagou tudo: avisa que parou de digitar imediatamente, sem esperar o TTL
    lastTypingWriteAt = 0;
    updateDoc(doc(db, "chats", activeChatId), { [`typing.${myUid}`]: 0 }).catch(() => {});
    return;
  }

  const now = Date.now();
  if (now - lastTypingWriteAt < TYPING_WRITE_THROTTLE_MS) return;
  lastTypingWriteAt = now;
  updateDoc(doc(db, "chats", activeChatId), { [`typing.${myUid}`]: now }).catch(() => {});
});

messageInput.addEventListener("blur", () => {
  if (!activeChatId) return;
  updateDoc(doc(db, "chats", activeChatId), { [`typing.${myUid}`]: 0 }).catch(() => {});
});

function startReply(messageId, senderName, text) {
  replyingTo = { messageId, senderName };
  replyPreviewName.textContent = senderName;
  replyPreviewBody.textContent = text;
  replyPreview.classList.remove("hidden");
  messageInput.focus();
}

function cancelReply() {
  replyingTo = null;
  replyPreview.classList.add("hidden");
}

btnCancelReply.addEventListener("click", cancelReply);

// ---------- painel de figurinhas e GIFs ----------

btnAttach.addEventListener("click", (e) => {
  e.stopPropagation();
  attachPanel.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (attachPanel.classList.contains("hidden")) return;
  if (attachPanel.contains(e.target) || btnAttach.contains(e.target)) return;
  attachPanel.classList.add("hidden");
});

attachTabs.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  [...attachTabs.children].forEach((b) => b.classList.toggle("active", b === btn));
  tabStickersPanel.classList.toggle("hidden", btn.dataset.tab !== "stickers");
  tabGifsPanel.classList.toggle("hidden", btn.dataset.tab !== "gifs");
  if (btn.dataset.tab === "gifs" && !gifResults.children.length) searchGifs("");
});

const GIPHY_CONFIGURED = GIPHY_API_KEY && GIPHY_API_KEY !== "SUBSTITUA_AQUI";
if (!GIPHY_CONFIGURED) gifHint.classList.remove("hidden");

async function searchGifs(query) {
  if (!GIPHY_CONFIGURED) return;
  gifResults.innerHTML = "";
  try {
    const endpoint = query
      ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=g`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=g`;
    const res = await fetch(endpoint);
    const data = await res.json();
    (data.data || []).forEach((gif) => {
      const images = gif.images || {};
      const previewUrl = (images.fixed_height_small || images.fixed_width_small || {}).url;
      const fullUrl = (images.fixed_height || images.downsized || images.original || {}).url;
      if (!previewUrl || !fullUrl) return;

      const item = document.createElement("button");
      item.type = "button";
      item.className = "gif-result-item";
      const img = document.createElement("img");
      img.src = previewUrl;
      img.alt = "";
      item.appendChild(img);
      item.addEventListener("click", async () => {
        attachPanel.classList.add("hidden");
        await sendChatMessage(fullUrl, "gif");
      });
      gifResults.appendChild(item);
    });
  } catch (e) {
    showAppError("Não foi possível buscar GIFs agora.");
  }
}

gifSearchInput.addEventListener("input", () => {
  clearTimeout(gifSearchDebounce);
  gifSearchDebounce = setTimeout(() => searchGifs(gifSearchInput.value.trim()), 400);
});

async function sendChatMessage(content, kind = "text") {
  if (!activeChatId || !content) return false;
  const chat = chats.get(activeChatId);
  const key = await getChatKey(chat);
  if (!key) {
    showAppError("Ainda não foi possível estabelecer a chave de criptografia desta conversa. Tente de novo em instantes.");
    return false;
  }

  const ts = Date.now();
  const chatRef = doc(db, "chats", activeChatId);
  const replySnapshot = replyingTo;
  cancelReply();
  try {
    const { ciphertext, iv } = await encryptText(key, content);
    const msgData = {
      senderId: myUid,
      senderName: myProfile.name,
      ciphertext,
      iv,
      kind,
      ts,
      readBy: [],
      readAt: {},
    };
    if (replySnapshot) msgData.replyTo = { messageId: replySnapshot.messageId, senderName: replySnapshot.senderName };
    await addDoc(collection(chatRef, "messages"), msgData);
    const chatUpdate = {
      lastMessage: { ciphertext, iv, senderName: myProfile.name, senderId: myUid, ts, kind },
      [`typing.${myUid}`]: 0,
    };
    (chat.memberIds || [])
      .filter((uid) => uid !== myUid)
      .forEach((uid) => {
        chatUpdate[`unreadCount.${uid}`] = increment(1);
      });
    await updateDoc(chatRef, chatUpdate);
    return true;
  } catch (err) {
    showAppError("Não foi possível enviar: " + err.message);
    return false;
  }
}

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !activeChatId) return;
  messageInput.value = "";
  await sendChatMessage(text, "text");
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

// ---------- barra de navegação, busca e filtros da lista ----------

function openNewChatModal() {
  buildGroupIconGrid();
  switchModalTab("direct");
  openModal();
}

btnNavNew.addEventListener("click", openNewChatModal);
btnEmptyNewChat.addEventListener("click", openNewChatModal);

btnNavChats.addEventListener("click", () => {
  screenApp.classList.remove("showing-chat");
  setChatFilter("all");
});

btnNavSearch.addEventListener("click", () => {
  screenApp.classList.remove("showing-chat");
  chatSearchInput.focus();
  chatSearchInput.select();
});

function setChatFilter(filter) {
  chatFilter = filter;
  [...chatFilters.children].forEach((b) => b.classList.toggle("active", b.dataset.filter === filter));
  renderChatList();
}

chatFilters.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-filter]");
  if (!btn) return;
  setChatFilter(btn.dataset.filter);
});

chatSearchInput.addEventListener("input", () => {
  chatSearchTerm = chatSearchInput.value.trim().toLowerCase();
  btnClearSearch.classList.toggle("hidden", chatSearchTerm === "");
  renderChatList();
});

btnClearSearch.addEventListener("click", () => {
  chatSearchInput.value = "";
  chatSearchTerm = "";
  btnClearSearch.classList.add("hidden");
  renderChatList();
  chatSearchInput.focus();
});

btnArchiveChat.addEventListener("click", () => {
  if (!activeChatId) return;
  const nowArchived = !isArchived(activeChatId);
  setArchived(activeChatId, nowArchived);
  closeActiveChat();
  screenApp.classList.remove("showing-chat");
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
    attachPanel.classList.add("hidden");
  }
});

// ---------- notificações (som / aviso na tela / notificação do navegador) ----------

function getNotifSetting(key) {
  const stored = localStorage.getItem("bapo-notif-" + key);
  if (stored === null) return key !== "browser"; // padrão: aviso+som ligados, navegador desligado (exige permissão)
  return stored === "true";
}

function setNotifSetting(key, value) {
  try {
    localStorage.setItem("bapo-notif-" + key, String(value));
  } catch (e) {}
}

function getNotifSoundType() {
  return localStorage.getItem("bapo-notif-sound-type") || "ding";
}

function playNotificationSound(type) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const sequences = {
      ding: [880, 1320],
      soft: [520],
      alert: [660, 440, 660],
    };
    const seq = sequences[type] || sequences.ding;
    seq.forEach((freq, i) => {
      const t0 = now + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.17);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch (e) {}
}

async function ensureNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch (e) {
    return "denied";
  }
}

function showBrowserNotification(title, body, iconSrc) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, icon: iconSrc || "icons/icon-192.png", tag: "bapo-msg" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (e) {}
}

function showToast(chat, title, body, avatarSrc) {
  const toast = document.createElement("div");
  toast.className = "toast";

  const avatar = document.createElement("img");
  avatar.className = "toast-avatar";
  avatar.alt = "";
  if (avatarSrc) avatar.src = avatarSrc;
  toast.appendChild(avatar);

  const col = document.createElement("div");
  col.className = "toast-col";
  const t = document.createElement("p");
  t.className = "toast-title";
  t.textContent = title;
  const b = document.createElement("p");
  b.className = "toast-body";
  b.textContent = body;
  col.appendChild(t);
  col.appendChild(b);
  toast.appendChild(col);

  toast.addEventListener("click", () => {
    openChat(chat.id);
    toast.remove();
  });

  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

async function maybeNotify(chat) {
  if (!chat.lastMessage || !chat.lastMessage.senderId) return;
  if (chat.lastMessage.senderId === myUid) return;
  if (chat.id === activeChatId && document.hasFocus()) return; // já está vendo essa conversa

  const info = chatDisplayInfo(chat);
  const bodyText = await decryptPreview(chat, chat.lastMessage);

  if (getNotifSetting("toast")) showToast(chat, info.name, bodyText, info.avatarSrc);
  if (getNotifSetting("sound")) playNotificationSound(getNotifSoundType());
  if (getNotifSetting("browser") && document.visibilityState !== "visible") {
    showBrowserNotification(info.name, bodyText, info.avatarSrc);
  }
}

function initNotifSettings() {
  notifToastCheckbox.checked = getNotifSetting("toast");
  notifSoundCheckbox.checked = getNotifSetting("sound");
  notifSoundTypeSelect.value = getNotifSoundType();
  notifBrowserCheckbox.checked = getNotifSetting("browser") && "Notification" in window && Notification.permission === "granted";

  notifToastCheckbox.addEventListener("change", () => setNotifSetting("toast", notifToastCheckbox.checked));

  notifSoundCheckbox.addEventListener("change", () => {
    setNotifSetting("sound", notifSoundCheckbox.checked);
    if (notifSoundCheckbox.checked) playNotificationSound(getNotifSoundType());
  });

  notifSoundTypeSelect.addEventListener("change", () => {
    localStorage.setItem("bapo-notif-sound-type", notifSoundTypeSelect.value);
    playNotificationSound(notifSoundTypeSelect.value);
  });

  notifBrowserCheckbox.addEventListener("change", async () => {
    if (!notifBrowserCheckbox.checked) {
      setNotifSetting("browser", false);
      return;
    }
    const perm = await ensureNotificationPermission();
    if (perm !== "granted") {
      notifBrowserCheckbox.checked = false;
      window.alert(perm === "unsupported" ? "Seu navegador não suporta notificações." : "Permissão de notificação negada. Ative nas configurações do navegador se quiser usar essa opção.");
      return;
    }
    setNotifSetting("browser", true);
  });
}

buildColorSwatches();
applyAppearance();
initNotifSettings();
