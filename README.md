# bapo

Chat em tempo real com conversas individuais, grupos e mensagens criptografadas.

## Como funciona

- Quem cria o perfil já começa com o gatinho do bapo como foto (ou escolhe a outra variação), e pode enviar uma foto do próprio aparelho. Depois é só o nome, e opcionalmente entrar com e-mail/senha pra acessar os mesmos contatos em qualquer aparelho (sem conta, funciona só naquele navegador).
- Pela barra lateral dá pra criar uma conversa individual, criar um grupo (com nome e ícone) ou entrar em uma já existente com um código de convite.
- Várias conversas ficam abertas ao mesmo tempo na barra lateral — dá pra trocar entre elas sem perder nada.
- **Mensagens são cifradas no navegador antes de ir pro servidor** (Web Crypto API, AES-256-GCM). O Firestore só armazena texto cifrado.
- Confirmação de leitura (✓✓, fica azul quando a outra pessoa lê, com horário) e status de presença (online agora / inativo / em hibernação) em conversas individuais.
- Botão "Limpar chat" (apaga tudo na hora) e, opcionalmente, "mensagens temporárias" por conversa — quando ativado no menu "⋮" daquela conversa, mensagens com mais de 30 minutos somem sozinhas. Vem desligado por padrão em toda conversa nova.
- Instalável como app (PWA) — funciona com ícone na tela inicial e abre em janela própria.
- Cor do tema e modo claro/escuro/sistema são configuráveis pelo ícone de engrenagem.
- **Figurinhas**: envie uma imagem do computador (botão 🖼️ ao lado do campo de mensagem) e ela vira uma figurinha reutilizável. A coleção fica guardada no próprio aparelho (IndexedDB), então continua lá depois de fechar e abrir o app; quem entra com e-mail/Google também tem uma cópia no Firestore (uma figurinha por documento) pra usar a mesma coleção em qualquer aparelho. Fundo transparente preservado (WebP, ou PNG se o navegador não suportar).
- **Cartão de perfil**: toque na sua foto (barra lateral) ou no nome de alguém na lista de participantes pra abrir o cartão — capa colorida, foto, apelido e os números da pessoa (conversas e grupos que vocês têm juntos, e quantos contatos ela tem). No cartão dos outros tem o botão **Adicionar aos contatos** e o atalho pra abrir a conversa; no seu, a lista dos seus contatos e o atalho pra editar o perfil.
- **Fotos**: botão 📷 ao lado do campo de mensagem (dá pra escolher várias da galeria de uma vez) ou colar uma imagem (Ctrl+V) com a conversa aberta. A foto é reduzida no navegador (até 1280px, JPEG) e cifrada como as mensagens. Toque na foto pra ver em tela cheia.
- **Contatos**: a lista fica em `users/{uid}.contacts` no Firestore, então acompanha você em qualquer aparelho onde entrar com a mesma conta.
- **Digitando**: quando alguém está escrevendo, aparecem três pontinhos no canto inferior esquerdo da conversa. Em grupo vem junto a foto e o nome de quem está digitando.
- **GIFs**: busca de GIFs da internet direto no mesmo painel (aba "GIFs"), usando a API gratuita do GIPHY — exige configurar uma chave própria em `gif-config.js` (veja abaixo).

### Sobre a criptografia — o que ela cobre e o que não cobre

Toda conversa (individual ou em grupo) tem uma chave AES-256 própria, gerada na criação e guardada no documento do chat no Firestore. Quem protege essa chave são as regras de segurança do banco — só quem já é membro daquela conversa consegue ler o documento (e portanto a chave). Isso significa que a mesma conversa abre normalmente em qualquer aparelho onde você estiver logado, como em outros apps de mensagens — não existe uma chave "por aparelho" que trave a leitura ao trocar de dispositivo.

Isso protege contra: vazamento do banco de dados, acesso indevido de quem nunca fez parte da conversa, alguém bisbilhotando o Firestore diretamente. Não é o mesmo nível de uma criptografia ponta-a-ponta "com chave embrulhada por pessoa" como fariam apps de mensagens dedicados — qualquer membro de uma conversa sempre teve acesso a ela de qualquer forma, então isso não muda o modelo de confiança dentro do próprio grupo/conversa.

## Layout (v2)

- **Desktop**: três colunas — barra de navegação lateral (vira menu com rótulos em telas ≥1400px), lista de conversas e o painel da conversa ocupando o resto da tela. As mensagens e o campo de escrita ficam num bloco central de até 980px, pra linha não ficar longa demais em monitores largos.
- **Tablet / telas médias**: as mesmas três colunas, mais estreitas; o botão "Enviar" fica só com o ícone.
- **Celular (<768px)**: uma coluna só, com barra de abas embaixo (Conversas · Buscar · Nova · Ajustes · perfil). A conversa aberta ocupa a tela inteira com botão de voltar.
- Breakpoints seguem os mesmos valores do Bootstrap (576 / 768 / 992 / 1200 / 1400px).
- Estética retrô: tons creme no modo claro, preto suave no escuro, tipografia serifada (Fraunces) nos títulos e textura de papel leve por cima de tudo.
- A ilustração da marca (`icons/bapo-mark.png`) aparece na tela de boas-vindas, no login e na barra lateral, com o fundo recortado pra funcionar no claro e no escuro. O ícone do app/favicon (`icons/icon-192.png` e `icons/icon-512.png`) é o "b" branco no quadrado índigo.
- A lista tem **busca por nome**, filtros **Todas / Não lidas / Arquivadas** e a opção "Arquivar conversa" no menu de opções da conversa (o arquivamento fica guardado neste navegador).
- As mensagens são separadas por dia, como no WhatsApp: "Hoje", "Ontem", o dia da semana com a data ("terça-feira, 15 de setembro") na mesma semana e a data completa nas mais antigas.
- **Informações da conversa**: toque no nome/foto no topo do chat pra abrir — mostra participantes, código do convite e, em grupos, deixa **trocar o nome e a foto** (enviar uma imagem do computador ou escolher um dos ícones prontos). As mesmas opções aparecem na hora de criar o grupo.
- O menu "⋮" virou um menu de opções com ícones, separado entre ações do dia a dia e "zona de risco" (limpar mensagens / sair).

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

Se quiser rodar local **sem subir o emulador** (útil pra olhar o layout — o emulador do Firestore exige Java instalado), abra a página com `?firebase=prod`, por exemplo `http://localhost:3000/?firebase=prod`. A escolha fica guardada no navegador; pra voltar ao emulador, abra com `?firebase=emulator`.

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

> Se o projeto já estava no ar antes da v2, publique as regras de novo: elas ganharam a coleção `stickers/{uid}/items`, usada pra sincronizar as figurinhas entre aparelhos. Sem isso as figurinhas continuam funcionando, só ficam guardadas em cada aparelho.

## Avatares padrão (perfil de admin)

Quem é admin pode trocar as fotos que aparecem por padrão na criação do perfil direto pelo app, sem mexer no código. Enquanto nenhuma for enviada, valem os dois gatinhos que vêm junto (`icons/avatar-cat-1.png` e `icons/avatar-cat-2.png`).

1. Publique as regras deste projeto (`firestore.rules`) — elas trazem a coleção `admins` e os ajustes em `settings`.
2. Abra o app, clique na engrenagem e copie o seu ID, que fica no fim do painel em "Seu ID".
3. No Console do Firebase, em Firestore Database, crie a coleção `admins` e dentro dela um documento com esse ID (pode ficar vazio).
4. Recarregue o app: o painel de aparência passa a mostrar a seção de avatares padrão, onde dá pra adicionar e remover fotos.

As imagens ficam em `settings/avatars/items`, uma por documento e reduzidas pra 256px, e aparecem na hora pra quem for criar o perfil. Só quem está em `admins` consegue escrever ali; as outras pessoas apenas leem.

## Configurar a busca de GIFs (opcional)

Sem isso, a aba de GIFs mostra um aviso e as figurinhas continuam funcionando normalmente.

1. Acesse [developers.giphy.com](https://developers.giphy.com) e crie uma conta grátis.
2. No painel, clique em "Create an App" → escolha "API" (não "SDK") → dê um nome qualquer.
3. Copie a chave que aparece em "API Key".
4. Cole a chave em `GIPHY_API_KEY`, no arquivo `gif-config.js`.
