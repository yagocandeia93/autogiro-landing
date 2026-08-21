/**
 * O app real da AutoGiro roda no Railway, em outro domínio e outro
 * repositório — a landing (Vercel) só empresta a porta de entrada. A raiz do
 * app responde 307 para /login, então apontamos direto para /login e poupamos
 * um salto de rede em quem clica em "Entrar".
 *
 * Esta URL também está literalmente em next.config.js (os redirects de
 * /login e /entrar): aquele arquivo é CommonJS e roda antes do TypeScript,
 * então não dá para importar daqui. Se o endereço do app mudar, os dois
 * lugares mudam juntos.
 */
export const APP_LOGIN_URL = "https://app.autogirodms.com.br/login";
