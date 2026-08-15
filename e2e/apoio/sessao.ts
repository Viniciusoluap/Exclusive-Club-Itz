/**
 * Entrar no sistema sem depender de login externo.
 *
 * COMO O SISTEMA AUTENTICA: um cookie `app_session_id` com um token assinado
 * (HS256) usando o `JWT_SECRET`, carregando `openId`, `appId` e `name`. O
 * servidor verifica a assinatura e busca o usuário pelo `openId`.
 *
 * POR QUE ISSO NÃO É UMA BRECHA: o token só é aceito se estiver assinado com o
 * `JWT_SECRET` do servidor. Nos testes, o servidor sobe com um segredo de
 * mentira que o próprio teste define — então o teste consegue assinar. Em
 * produção o segredo é outro, e ninguém de fora consegue forjar nada.
 *
 * O usuário PRECISA existir no banco antes: se o `openId` não for encontrado, o
 * servidor tenta buscá-lo no servidor de OAuth, que nos testes não existe.
 */

import { SignJWT } from "jose";
import type { BrowserContext } from "@playwright/test";
import { SEGREDOS_E2E } from "./ambiente";

/** Nome do cookie de sessão — precisa bater com `shared/const.ts`. */
export const COOKIE_DE_SESSAO = "app_session_id";

/** Assina um token de sessão igual ao que o servidor emitiria. */
export async function tokenDeSessao(openId: string, nome: string): Promise<string> {
  const chave = new TextEncoder().encode(SEGREDOS_E2E.JWT_SECRET);

  return new SignJWT({ openId, appId: SEGREDOS_E2E.VITE_APP_ID, name: nome })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(chave);
}

/**
 * Deixa o navegador logado como o usuário informado.
 *
 * O cookie é posto direto no contexto do navegador, antes da primeira página.
 * Assim o teste começa já autenticado, sem passar por telas de login que não
 * fazem parte do fluxo sob teste.
 */
export async function entrarComo(
  contexto: BrowserContext,
  usuario: { openId: string; nome: string },
  baseURL: string,
): Promise<void> {
  const token = await tokenDeSessao(usuario.openId, usuario.nome);
  const { hostname } = new URL(baseURL);

  await contexto.addCookies([
    {
      name: COOKIE_DE_SESSAO,
      value: token,
      domain: hostname,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}
