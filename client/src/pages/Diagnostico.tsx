import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
  ) : (
    <XCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
  );
}

export default function Diagnostico() {
  const [, setLocation] = useLocation();
  const { data, isLoading, isError, error, refetch, isFetching } =
    trpc.system.diagnostics.useQuery(undefined, { refetchOnWindowFocus: false });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/configuracoes")}>
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
          Voltar
        </Button>
        <h1 className="text-xl font-bold">Diagnóstico do Sistema</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Mostra o que o servidor <strong>realmente</strong> está executando. Nenhum
        valor de senha ou chave é exibido — apenas se existe e o tamanho.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Consultando o servidor…
        </div>
      )}

      {isError && (
        <Card className="border-red-300">
          <CardHeader>
            <CardTitle className="text-red-700">Não foi possível consultar</CardTitle>
            <CardDescription>{error?.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => refetch()}>Tentar novamente</Button>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Versão em execução</CardTitle>
              <CardDescription>
                Se o marcador abaixo não for o esperado, o deploy não levou o código
                novo — e não adianta procurar o defeito no código.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Marcador de build:</span>
                <Badge variant="outline" className="font-mono text-sm">
                  {data.buildMarker}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Servidor iniciado em: </span>
                {new Date(data.processStartedAt).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}
              </div>
              <div>
                <span className="text-muted-foreground">Hora do servidor: </span>
                {new Date(data.serverTime).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}
              </div>
              <div>
                <span className="text-muted-foreground">NODE_ENV: </span>
                <span className="font-mono">{data.nodeEnv}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Variáveis de ambiente{" "}
                {data.missingCount > 0 && (
                  <Badge variant="destructive" className="ml-1">
                    {data.missingCount} faltando
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                O que o processo do servidor enxerga neste momento.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.envVars.map((v) => (
                <div key={v.name} className="text-sm">
                  <div className="flex items-center gap-2">
                    {/* Uma opcional ausente não é falha: o sistema tem outro
                        caminho para ela. Pintar de vermelho mandava procurar
                        problema onde não havia. */}
                    <StatusIcon ok={v.present || !v.critica} />
                    <span className="font-mono break-all">{v.name}</span>
                    <span className="text-muted-foreground">
                      {v.present ? `presente (${v.length} caracteres)` : "ausente"}
                    </span>
                  </div>
                  {!v.present && (
                    <p className="ml-6 text-xs text-muted-foreground">{v.nota}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <StatusIcon ok={data.smtp.ok} />
                Envio de e-mail (SMTP)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="break-words text-sm text-muted-foreground">
                {data.smtp.detail}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <StatusIcon ok={data.backup.ok} />
                Backup — chave de criptografia
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="break-words text-sm text-muted-foreground">
                {data.backup.reason}
              </p>
            </CardContent>
          </Card>

          {/*
            Estado das migrações.

            Durante toda a auditoria, "a migração chegou no banco?" foi uma
            pergunta sem resposta — e cada vez que ficou sem resposta, custou
            uma rodada de investigação. Agora a tela responde.
          */}
          {data.migracoes && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <StatusIcon ok={!data.migracoes.erro} />
                  Migrações do banco
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  {data.migracoes.situacao === 'baseline-adotado'
                    ? 'Banco existente adotado: as migrações atuais foram marcadas como aplicadas, sem executar DDL sobre os dados.'
                    : data.migracoes.situacao === 'banco-novo'
                      ? 'Banco novo: todas as migrações foram aplicadas.'
                      : data.migracoes.situacao === 'ja-controlado'
                        ? 'Banco sob controle de migrações.'
                        : 'Não foi possível verificar as migrações.'}
                </p>

                {data.migracoes.aplicadas?.length > 0 && (
                  <p className="break-words">
                    <span className="text-muted-foreground">Aplicadas agora: </span>
                    <code className="text-xs">{data.migracoes.aplicadas.join(', ')}</code>
                  </p>
                )}

                {data.migracoes.marcadasSemExecutar?.length > 0 && (
                  <p className="break-words">
                    <span className="text-muted-foreground">
                      Marcadas sem executar ({data.migracoes.marcadasSemExecutar.length}):{' '}
                    </span>
                    <code className="text-xs">{data.migracoes.marcadasSemExecutar.join(', ')}</code>
                  </p>
                )}

                {data.migracoes.jaSatisfeitas?.length > 0 && (
                  <div className="break-words">
                    <span className="text-muted-foreground">
                      Já existiam, não refeitas ({data.migracoes.jaSatisfeitas.length}):
                    </span>
                    <ul className="ml-4 list-disc">
                      {data.migracoes.jaSatisfeitas.map((s: string) => (
                        <li key={s} className="text-xs">
                          <code>{s}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.migracoes.erro && (
                  <p className="break-words text-red-600">{data.migracoes.erro}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/*
            Conferência de schema: o banco tem tudo que o código espera?

            A hospedagem aplicou ao banco uma migração gerada por ela mesma, que
            não existe no repositório e ninguém revisou. DDL gerado por
            diferença pode apagar coluna — este card responde se apagou.
          */}
          {data.schemaBanco && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <StatusIcon ok={data.schemaBanco.integro} />
                  Estrutura do banco
                </CardTitle>
                <CardDescription>
                  Compara as {data.schemaBanco.tabelasConferidas} tabelas que o sistema
                  espera com as que o banco realmente tem. Só lê, não altera nada.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {data.schemaBanco.erro ? (
                  <p className="break-words text-red-600">{data.schemaBanco.erro}</p>
                ) : data.schemaBanco.integro ? (
                  <p className="text-muted-foreground">
                    Nenhuma coluna faltando. Nada foi perdido.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {data.schemaBanco.problemas.map((p) => (
                      <p key={p.tabela} className="break-words text-red-700">
                        <strong>{p.tabela}</strong>:{' '}
                        {p.ausente
                          ? 'tabela não existe no banco'
                          : `falta ${p.colunasFaltando.join(', ')}`}
                      </p>
                    ))}
                  </div>
                )}

                {data.schemaBanco.extras?.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-muted-foreground">
                      {/* Coluna a mais é resíduo de versão antiga: não quebra nada. */}
                      Colunas antigas que o sistema não usa ({data.schemaBanco.extras.length} tabelas)
                    </summary>
                    <div className="mt-2 space-y-1">
                      {data.schemaBanco.extras.map((e) => (
                        <p key={e.tabela} className="break-words text-xs text-muted-foreground">
                          <strong>{e.tabela}</strong>: {e.colunasExtras.join(', ')}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          )}

          <Button onClick={() => refetch()} disabled={isFetching} variant="outline">
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Atualizar
          </Button>
        </>
      )}
    </div>
  );
}
