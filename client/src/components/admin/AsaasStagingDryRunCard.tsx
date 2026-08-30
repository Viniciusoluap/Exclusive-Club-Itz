import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AsaasStagingDryRunCard() {
  const utils = trpc.useUtils();
  const dryRunStatus = trpc.system.asaasStagingDryRunStatus.useQuery(undefined, {
    refetchInterval: query =>
      query.state.data?.status === "running" ? 2_000 : false,
    refetchOnWindowFocus: false,
  });
  const dryRunMutation = trpc.system.asaasStagingDryRun.useMutation({
    onSuccess: async () => {
      await utils.system.asaasStagingDryRunStatus.invalidate();
    },
  });
  const dryRun = dryRunStatus.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reconciliação Asaas — staging</CardTitle>
        <CardDescription>
          Executa uma comparação somente leitura com o banco dedicado de staging.
          Este painel não aceita modo de aplicação nem a conexão ativa do app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Button
          onClick={() => dryRunMutation.mutate()}
          disabled={dryRunMutation.isPending || dryRun?.status === "running"}
          variant="outline"
        >
          {dryRunMutation.isPending || dryRun?.status === "running"
            ? "Executando dry-run…"
            : "Executar dry-run Asaas"}
        </Button>

        {dryRunMutation.isError && (
          <p className="text-red-600">
            O dry-run não foi iniciado. Nenhuma alteração foi aplicada.
          </p>
        )}

        {dryRun?.status === "failed" && (
          <div className="space-y-1 rounded-md bg-muted p-3">
            <p><strong>Etapa:</strong> {dryRun.result.stage}</p>
            <p><strong>Encerramento:</strong> {dryRun.result.type}</p>
            <p><strong>Páginas iniciadas:</strong> {dryRun.result.pagesStarted}</p>
            <p>
              <strong>Último deslocamento:</strong>{" "}
              {dryRun.result.lastOffset ?? "não iniciado"}
            </p>
            <p>Nenhuma alteração foi aplicada.</p>
          </div>
        )}

        {dryRun?.status === "completed" && (
          <div className="space-y-1 rounded-md bg-muted p-3">
            <p><strong>Modo:</strong> {dryRun.result.mode}</p>
            <p>
              <strong>Clientes Asaas:</strong>{" "}
              {dryRun.result.customers.total.toLocaleString("pt-BR")}
            </p>
            <p>
              <strong>Pagamentos Asaas:</strong>{" "}
              {dryRun.result.payments.total.toLocaleString("pt-BR")}
            </p>
            <p>
              <strong>Vínculos locais:</strong>{" "}
              {dryRun.result.payments.matchedLocalClients.toLocaleString("pt-BR")}
            </p>
            <p>
              <strong>Sem vínculo local:</strong>{" "}
              {dryRun.result.payments.unmatchedLocalClients.toLocaleString("pt-BR")}
            </p>
            <p><strong>Avisos:</strong> {dryRun.result.warnings.total}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
