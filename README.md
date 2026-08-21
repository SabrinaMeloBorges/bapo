# bapo

Chat em tempo real com conversas individuais, grupos e mensagens criptografadas.

## Como funciona

- Cada pessoa escolhe um avatar (ou envia uma foto), um nome, e opcionalmente entra com e-mail/senha pra acessar os mesmos contatos em qualquer aparelho (sem conta, funciona só naquele navegador).
- Pela barra lateral dá pra criar uma conversa individual, criar um grupo (com nome e ícone) ou entrar em uma já existente com um código de convite.
- Várias conversas ficam abertas ao mesmo tempo na barra lateral — dá pra trocar entre elas sem perder nada.
- **Mensagens são cifradas no navegador antes de ir pro servidor** (Web Crypto API, AES-256-GCM). O Firestore só armazena texto cifrado.
- Confirmação de leitura (✓✓, fica azul quando a outra pessoa lê, com horário) e status de presença (online agora / inativo / em hibernação) em conversas individuais.
- Botão "Limpar chat" (apaga tudo na hora) e, opcionalmente, "mensagens temporárias" por conversa — quando ativado no menu "⋮" daquela conversa, mensagens com mais de 30 minutos somem sozinhas. Vem desligado por padrão em toda conversa nova.
- Instalável como app (PWA) — funciona com ícone na tela inicial e abre em janela própria.
- Cor do tema e modo claro/escuro/sistema são configuráveis pelo ícone de engrenagem.
- **Figurinhas**: envie uma imagem do computador (botão 🖼️ ao lado do campo de mensagem) e ela vira uma figurinha reutilizável, salva na sua coleção (sincronizada entre aparelhos se você entrar com e-mail/Google). Fundo transparente preservado (PNG).
- **GIFs**: busca de GIFs da internet direto no mesmo painel (aba "GIFs"), usando a API gratuita do Tenor — exige configurar uma chave própria em `gif-config.js` (veja abaixo).

### Sobre a criptografia — o que ela cobre e o que não cobre

Toda conversa (individual ou em grupo) tem uma chave AES-256 própria, gerada na criação e guardada no documento do chat no Firestore. Quem protege essa chave são as regras de segurança do banco — só quem já é membro daquela conversa consegue ler o documento (e portanto a chave). Isso significa que a mesma conversa abre normalmente em qualquer aparelho onde você estiver logado, como em outros apps de mensagens — não existe uma chave "por aparelho" que trave a leitura ao trocar de dispositivo.

Isso protege contra: vazamento do banco de dados, acesso indevido de quem nunca fez parte da conversa, alguém bisbilhotando o Firestore diretamente. Não é o mesmo nível de uma criptografia ponta-a-ponta "com chave embrulhada por pessoa" como fariam apps de mensagens dedicados — qualquer membro de uma conversa sempre teve acesso a ela de qualquer forma, então isso não muda o modelo de confiança dentro do próprio grupo/conversa.

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
3. Ative os métodos de login (Build → Authentication → Get started → Sign-in method): **Anonymous** e **Email/Password**.
4. Em Configurações do projeto → Geral → Seus apps, registre um app Web e copie o `firebaseConfig`.
5. Cole esses valores em `PRODUCTION_CONFIG`, no arquivo `firebase-config.js`.
6. Em Firestore Database → Regras, cole o conteúdo do arquivo `firestore.rules` deste projeto e publique.

## Configurar a busca de GIFs (opcional)

Sem isso, a aba de GIFs mostra um aviso e as figurinhas continuam funcionando normalmente.

1. Acesse [console.cloud.google.com](https://console.cloud.google.com), crie ou escolha um projeto.
2. Em "APIs e serviços" → "Biblioteca", procure **Tenor API** e ative.
3. Em "APIs e serviços" → "Credenciais" → "Criar credenciais" → "Chave de API".
4. Cole a chave em `TENOR_API_KEY`, no arquivo `gif-config.js`.
