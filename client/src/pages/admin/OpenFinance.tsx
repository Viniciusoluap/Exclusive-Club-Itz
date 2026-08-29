import { useMemo, useState } from "react";
import { PluggyConnect } from "react-pluggy-connect";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Link2,
  Loader2,
  RefreshCw,
  Unlink,
  Wallet,
  AlertCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const statusLabels: Record<string, string> = {
  pending: "Aguardando conexão",
  connected: "Conectada",
  syncing: "Sincronizando",
  error: "Com erro",
  disconnected: "Desconectada",
  consent_expired: "Consentimento expirado",
};

function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "connected") return "default";
  if (status === "error" || status === "consent_expired") return "destructive";
  if (status === "syncing") return "secondary";
  return "outline";
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "Nunca";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "Indisponível"
    : date.toLocaleString("pt-BR");
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function OpenFinance() {
  const [, setLocation] = useLocation();
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [widgetVisible, setWidgetVisible] = useState(false);

  const utils = trpc.useUtils();
  const connectionsQuery = trpc.openFinance.list.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const accountsQuery = trpc.openFinance.accounts.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const summaryQuery = trpc.openFinance.summary.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const tokenMutation = trpc.openFinance.createConnectToken.useMutation({
    onSuccess: data => {
      if (!data.accessToken) {
        toast.error("O provedor não retornou um Connect Token válido.");
        return;
      }
      setConnectToken(data.accessToken);
      setWidgetVisible(true);
    },
    onError: error => toast.error(error.message),
  });

  const syncMutation = trpc.openFinance.sync.useMutation({
    onSuccess: data => {
      toast.success(
        `${data.accountsImported} conta(s) e ${data.transactionsImported} transação(ões) processadas.`
      );
      void utils.openFinance.list.invalidate();
      void utils.openFinance.accounts.invalidate();
      void utils.openFinance.summary.invalidate();
    },
    onError: error => toast.error(`Falha na sincronização: ${error.message}`),
  });

  const disconnectMutation = trpc.openFinance.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Conexão marcada como desconectada localmente.");
      void utils.openFinance.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const connectedCount = summaryQuery.data?.connected ?? 0;
  const accounts = accountsQuery.data ?? [];
  const connections = connectionsQuery.data ?? [];
  const balance = useMemo(
    () => summaryQuery.data?.balance ?? 0,
    [summaryQuery.data?.balance]
  );

  const openNewConnection = () => {
    setConnectToken(null);
    setWidgetVisible(false);
    tokenMutation.mutate({});
  };

  const closeWidget = () => {
    setWidgetVisible(false);
    setConnectToken(null);
    void connectionsQuery.refetch();
    void accountsQuery.refetch();
    void summaryQuery.refetch();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/admin")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold">Open Finance</h1>
              <p className="text-xs text-muted-foreground">
                Conexões bancárias e conciliação financeira
              </p>
            </div>
          </div>
          <Button
            onClick={openNewConnection}
            disabled={tokenMutation.isPending}
          >
            {tokenMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            Conectar conta
          </Button>
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-4 py-8">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              As credenciais bancárias são tratadas pelo Connect Widget. O
              Exclusive Club armazena apenas os identificadores, saldos e
              transações autorizados pelo consentimento Open Finance.
            </p>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Conexões ativas</CardDescription>
              <CardTitle className="text-2xl">{connectedCount}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                de {summaryQuery.data?.connections ?? 0} registradas
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Contas agregadas</CardDescription>
              <CardTitle className="text-2xl">
                {summaryQuery.data?.accounts ?? accounts.length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                bancárias e de crédito
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Saldo consolidado</CardDescription>
              <CardTitle className="text-2xl">{formatMoney(balance)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                última leitura persistida
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Transações importadas</CardDescription>
              <CardTitle className="text-2xl">
                {summaryQuery.data?.transactions ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                com chave externa idempotente
              </p>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Conexões bancárias</CardTitle>
            <CardDescription>
              Cada vínculo pertence ao usuário que iniciou o consentimento. A
              sincronização é segura para repetição.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {connectionsQuery.isLoading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando conexões...
              </div>
            ) : connections.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-medium">Nenhuma conta conectada</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Clique em “Conectar conta” para abrir o fluxo seguro do Open
                  Finance.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {connections.map(connection => (
                  <div
                    key={connection.id}
                    className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-muted p-2">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            {connection.institutionName ||
                              "Instituição aguardando identificação"}
                          </p>
                          <Badge variant={statusVariant(connection.status)}>
                            {statusLabels[connection.status] ||
                              connection.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Provedor: {connection.provider} · Atualizada:{" "}
                          {formatDate(connection.lastSyncedAt)}
                        </p>
                        {connection.errorMessage && (
                          <p className="mt-1 text-xs text-destructive">
                            {connection.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          syncMutation.mutate({ connectionId: connection.id })
                        }
                        disabled={
                          syncMutation.isPending ||
                          connection.status === "disconnected"
                        }
                      >
                        {syncMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Sincronizar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          disconnectMutation.mutate({
                            connectionId: connection.id,
                          })
                        }
                        disabled={
                          disconnectMutation.isPending ||
                          connection.status === "disconnected"
                        }
                      >
                        <Unlink className="mr-2 h-4 w-4" />
                        Desconectar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contas sincronizadas</CardTitle>
            <CardDescription>
              Saldos são informativos e devem ser conciliados com o Asaas e os
              extratos oficiais.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                As contas aparecerão após a primeira sincronização.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {accounts.map(account => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Wallet className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{account.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {account.type || "Conta"} ·{" "}
                          {account.numberMasked || "número protegido"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {formatMoney(Number(account.balance || 0))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(account.lastUpdatedAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          Nenhum dado foi importado nesta tela sem consentimento e todos os
          registros têm ID externo para evitar duplicidade.
        </div>
      </main>

      {widgetVisible && connectToken && (
        <PluggyConnect connectToken={connectToken} onClose={closeWidget} />
      )}
    </div>
  );
}
