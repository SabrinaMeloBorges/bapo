# bapo

Chat simples e direto entre duas pessoas, em tempo real, sem guardar histórico.

## Como funciona

- Uma pessoa clica em **Criar sala** e recebe um link para enviar à outra pessoa (por WhatsApp, e-mail, etc).
- A outra pessoa abre o link e as duas caem direto na conversa.
- A conexão é ponto-a-ponto (WebRTC, via [PeerJS](https://peerjs.com/)) — as mensagens vão direto de um navegador para o outro, sem passar por nenhum banco de dados. Ao fechar a aba ou sair, a conversa desaparece.

Por ser conexão direta entre navegadores, em redes com firewall/NAT muito restritivo (comum em redes corporativas) a conexão pode falhar ocasionalmente.

## Rodar localmente

Qualquer servidor estático funciona. Exemplo com Node:

```bash
npx serve .
```

Depois abra a URL informada (ex: `http://localhost:3000`) em duas abas para simular as duas pessoas.

## Publicar no GitHub Pages

1. Suba os arquivos (`index.html`, `style.css`, `app.js`) para a branch `main` do repositório.
2. No GitHub: **Settings → Pages → Source**, selecione a branch `main` e a pasta `/ (root)`.
3. Aguarde alguns instantes e acesse a URL que o GitHub Pages gerar (ex: `https://seu-usuario.github.io/bapo/`).

Não há build nem dependências — é só HTML, CSS e JS puro.
