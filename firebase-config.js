// Detecta automaticamente se está rodando local (emulador) ou publicado (produção).
export const USE_EMULATOR = ["localhost", "127.0.0.1"].includes(location.hostname);

// Depois de criar seu projeto em https://console.firebase.google.com, substitua
// os valores abaixo pelos que aparecem em: Configurações do projeto > Geral >
// Seus apps > (ícone </>) > firebaseConfig. É seguro deixar esses valores
// públicos no código — quem protege os dados são as regras do Firestore
// (arquivo firestore.rules), não o sigilo dessas chaves.
const PRODUCTION_CONFIG = {
  apiKey: "AIzaSyBGsUj7KhUHmxC1ojfLT_biRXMYZKdlhls",
  authDomain: "bapo-2fde0.firebaseapp.com",
  projectId: "bapo-2fde0",
  storageBucket: "bapo-2fde0.firebasestorage.app",
  messagingSenderId: "526061809749",
  appId: "1:526061809749:web:cdef7a06d684468cd9e4dc",
};

// Usado só localmente, com o emulador (npx firebase-tools emulators:start).
const EMULATOR_CONFIG = {
  apiKey: "demo-key",
  authDomain: "demo-bapo.firebaseapp.com",
  projectId: "demo-bapo",
  appId: "demo-app",
};

export const firebaseConfig = USE_EMULATOR ? EMULATOR_CONFIG : PRODUCTION_CONFIG;
