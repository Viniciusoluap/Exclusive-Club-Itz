import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

/**
 * Traduz uma resposta que não é JSON para uma mensagem que diz o que houve.
 *
 * POR QUE ISSO EXISTE: quando o servidor devolve uma página de erro do proxy
 * (HTML) em vez de JSON, o Safari falha ao interpretar e reporta apenas
 * "The string did not match the expected pattern." Essa mensagem apareceu em
 * operações completamente diferentes — arquivar anexos e excluir backup — e não
 * dizia nada sobre a causa, o que custou uma rodada inteira de investigação.
 * Aqui a resposta bruta é lida e transformada em algo acionável.
 */
function describeNonJsonResponse(status: number, body: string): string {
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 160);

  if (status === 502 || status === 503 || status === 504) {
    return `O servidor não respondeu a tempo (HTTP ${status}). A operação pode ter sido interrompida no meio do caminho — verifique o resultado antes de repetir.`;
  }
  if (status === 413) {
    return `Conteúdo grande demais para uma única requisição (HTTP 413).`;
  }
  if (status === 401 || status === 403) {
    return `Sessão expirada ou sem permissão (HTTP ${status}).`;
  }
  return `Resposta inesperada do servidor (HTTP ${status})${snippet ? `: "${snippet}"` : " com corpo vazio"}.`;
}

async function fetchWithReadableErrors(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await globalThis.fetch(input, {
    ...(init ?? {}),
    credentials: "include",
  });

  // O tRPC sempre responde JSON. Qualquer outra coisa é erro de
  // infraestrutura, e é ela que precisa aparecer — não o erro de parse.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const body = await response.text().catch(() => "");
    throw new Error(describeNonJsonResponse(response.status, body));
  }

  return response;
}

const trpcClient = trpc.createClient({
  links: [
    /**
     * Mutations saem SEM agrupamento; queries continuam agrupadas.
     *
     * POR QUE: o httpBatchLink junta várias chamadas numa única requisição
     * HTTP. Esta tela faz polling a cada 5s enquanto um backup roda, então uma
     * mutation clicada pelo usuário ia no mesmo pacote que as queries de
     * polling — e uma operação lenta derrubava todas as outras junto, com a
     * mesma mensagem de erro. Foi assim que "excluir backup", que é
     * instantâneo, passou a falhar: ele não falhou, ele foi junto no pacote de
     * outra coisa. Mutations são poucas e disparadas por clique; separá-las
     * elimina esse acoplamento sem custo relevante.
     */
    splitLink({
      condition: (op) => op.type === "mutation",
      true: httpLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: fetchWithReadableErrors,
      }),
      false: httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: fetchWithReadableErrors,
      }),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
