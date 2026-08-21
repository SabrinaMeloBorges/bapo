// Chave gratuita da API do Tenor (Google), usada só pra buscar GIFs — não
// tem nada a ver com o Firebase. Como conseguir a sua:
//
// 1. Acesse https://console.cloud.google.com e crie um projeto (pode ser um
//    novo, separado do projeto do Firebase, ou o mesmo — tanto faz).
// 2. No menu, vá em "APIs e serviços" > "Biblioteca", procure por "Tenor API"
//    e clique em "Ativar".
// 3. Em "APIs e serviços" > "Credenciais" > "Criar credenciais" > "Chave de
//    API". Copie a chave gerada.
// 4. Cole o valor abaixo, no lugar de "SUBSTITUA_AQUI".
//
// É de graça (tem um limite generoso de buscas por mês, mais que suficiente
// pra uso pessoal). Enquanto não configurar, a aba de GIFs mostra um aviso
// em vez de tentar buscar.
export const TENOR_API_KEY = "SUBSTITUA_AQUI";
