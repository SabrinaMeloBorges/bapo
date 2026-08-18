# bapo

Chat em tempo real com conversas individuais e grupos, com histórico salvo.

## Como funciona

- Cada pessoa escolhe um avatar e um nome antes de começar (fica salvo só no aparelho dela).
- Pela barra lateral dá pra criar uma conversa individual, criar um grupo (com nome e ícone) ou entrar em uma já existente com um código de convite.
- Várias conversas ficam abertas ao mesmo tempo na barra lateral — dá pra trocar entre elas sem perder nada.
- Mensagens e conversas são salvas em tempo real no [Firebase](https://firebase.google.com/) (Firestore + Authentication anônima) e sincronizam entre qualquer aparelho.
- Cor do tema e modo claro/escuro/sistema são configuráveis pelo ícone de engrenagem.

## Rodar localmente

O projeto usa o [emulador do Firebase](https://firebase.google.com/docs/emulator-suite) para não precisar de internet nem de um projeto real durante o desenvolvimento.

1. Suba um servidor estático (em uma aba do terminal):
   ```bash
   npx serve .
   ```
2. Suba os emuladores do Firestore + Authentication (em outra aba):
   ```bash
   npx firebase-tools emulators:start --project demo-bapo --only firestore,auth
   ```
3. Abra a URL do passo 1 (ex: `http://localhost:3000`) em duas abas para simular duas pessoas.

O arquivo `firebase-config.js` detecta sozinho quando está rodando em `localhost`/`127.0.0.1` e usa o emulador automaticamente; em qualquer outro endereço (como o GitHub Pages) usa o projeto real do Firebase.

## Publicar no GitHub Pages

1. Suba os arquivos para a branch `main` do repositório.
2. No GitHub: **Settings → Pages → Source**, selecione a branch `main` e a pasta `/ (root)`.
3. Acesse a URL que o GitHub Pages gerar (ex: `https://seu-usuario.github.io/bapo/`).

Não há build — é só HTML, CSS e JS puro (o Firebase é carregado via CDN como módulo ES).

## Configurar seu próprio Firebase

1. Crie um projeto grátis em [console.firebase.google.com](https://console.firebase.google.com).
2. Ative **Firestore Database** (Build → Firestore Database → Criar banco de dados).
3. Ative o login anônimo (Build → Authentication → Get started → Sign-in method → Anonymous).
4. Em Configurações do projeto → Geral → Seus apps, registre um app Web e copie o `firebaseConfig`.
5. Cole esses valores em `PRODUCTION_CONFIG`, no arquivo `firebase-config.js`.
6. Em Firestore Database → Regras, cole o conteúdo do arquivo `firestore.rules` deste projeto e publique.
