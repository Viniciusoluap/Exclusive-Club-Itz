import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Save,
  XCircle,
} from "lucide-react";
import { useLocation } from "wouter";

type SettingsTab = "asaas" | "open-finance";
type TestStatus = "idle" | "testing" | "success" | "error";

const settingDescription: Record<string, string> = {
  asaas_api_key: "Chave de API do Asaas para sincronização financeira",
  asaas_webhook_token: "Token compartilhado para autenticar webhooks Asaas",
  pluggy_client_id: "Client ID do aplicativo Pluggy",
  pluggy_client_secret: "Client Secret do aplicativo Pluggy",
  pluggy_webhook_secret: "Segredo do header do webhook Pluggy",
  public_app_url: "URL HTTPS pública usada no webhook Open Finance",
};

export default function SystemSettings() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("asaas");
  const [asaasApiKey, setAsaasApiKey] = useState("");
  const [asaasWebhookToken, setAsaasWebhookToken] = useState("");
  const [pluggyClientId, setPluggyClientId] = useState("");
  const [pluggyClientSecret, setPluggyClientSecret] = useState("");
  const [pluggyWebhookSecret, setPluggyWebhookSecret] = useState("");
  const [publicAppUrl, setPublicAppUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [asaasTestStatus, setAsaasTestStatus] = useState<TestStatus>("idle");
  const [pluggyTestStatus, setPluggyTestStatus] = useState<TestStatus>("idle");

  const asaasStatus = trpc.systemSettings.getStatus.useQuery({
    key: "asaas_api_key",
  });
  const asaasWebhookStatus = trpc.systemSettings.getStatus.useQuery({
    key: "asaas_webhook_token",
  });
  const pluggyClientIdStatus = trpc.systemSettings.getStatus.useQuery({
    key: "pluggy_client_id",
  });
  const pluggyClientSecretStatus = trpc.systemSettings.getStatus.useQuery({
    key: "pluggy_client_secret",
  });
  const pluggyWebhookStatus = trpc.systemSettings.getStatus.useQuery({
    key: "pluggy_webhook_secret",
  });
  const publicAppUrlStatus = trpc.systemSettings.getStatus.useQuery({
    key: "public_app_url",
  });

  const saveMutation = trpc.systemSettings.set.useMutation();
  const asaasTestMutation = trpc.systemSettings.testConnection.useMutation();
  const pluggyTestMutation =
    trpc.systemSettings.testPluggyConnection.useMutation();

  const asaasConfigured = Boolean(asaasStatus.data?.configured);
  const asaasWebhookConfigured = Boolean(asaasWebhookStatus.data?.configured);
  const pluggyConfigured =
    Boolean(pluggyClientIdStatus.data?.configured) &&
    Boolean(pluggyClientSecretStatus.data?.configured);
  const pluggyWebhookConfigured = Boolean(pluggyWebhookStatus.data?.configured);
  const publicAppUrlConfigured = Boolean(publicAppUrlStatus.data?.configured);
  const statusLoading =
    asaasStatus.isLoading ||
    asaasWebhookStatus.isLoading ||
    pluggyClientIdStatus.isLoading ||
    pluggyClientSecretStatus.isLoading ||
    pluggyWebhookStatus.isLoading ||
    publicAppUrlStatus.isLoading;

  const refetchStatuses = async () => {
    await Promise.all([
      asaasStatus.refetch(),
      asaasWebhookStatus.refetch(),
      pluggyClientIdStatus.refetch(),
      pluggyClientSecretStatus.refetch(),
      pluggyWebhookStatus.refetch(),
      publicAppUrlStatus.refetch(),
    ]);
  };

  const saveEntries = async (
    entries: Array<{ key: string; value: string }>
  ) => {
    setIsSaving(true);
    try {
      for (const entry of entries) {
        await saveMutation.mutateAsync({
          key: entry.key,
          value: entry.value,
          description: settingDescription[entry.key],
        });
      }
      await refetchStatuses();
      toast.success("Configuração salva com segurança.");
    } catch (error) {
      toast.error(
        `Erro ao salvar configuração: ${error instanceof Error ? error.message : "tente novamente"}`
      );
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsaas = async () => {
    const entries: Array<{ key: string; value: string }> = [];
    const apiKey = asaasApiKey.trim();
    const webhookToken = asaasWebhookToken.trim();

    if (apiKey) {
      if (!apiKey.startsWith("$aact_")) {
        toast.error("Chave Asaas inválida. Ela deve começar com $aact_.");
        return;
      }
      entries.push({ key: "asaas_api_key", value: apiKey });
    }
    if (webhookToken) {
      entries.push({ key: "asaas_webhook_token", value: webhookToken });
    }
    if (entries.length === 0) {
      toast.error("Informe pelo menos uma configuração antes de salvar.");
      return;
    }

    try {
      await saveEntries(entries);
      setAsaasApiKey("");
      setAsaasWebhookToken("");
    } catch {
      // O toast de erro já foi exibido por saveEntries.
    }
  };

  const handleSavePluggy = async () => {
    const clientId = pluggyClientId.trim();
    const clientSecret = pluggyClientSecret.trim();
    const webhookSecret = pluggyWebhookSecret.trim();
    const appUrl = publicAppUrl.trim();

    if (!pluggyConfigured && (!clientId || !clientSecret)) {
      toast.error(
        "Na primeira configuração, informe o Client ID e o Client Secret da Pluggy."
      );
      return;
    }
    if (appUrl && !appUrl.startsWith("https://")) {
      toast.error("A URL pública precisa começar com https://.");
      return;
    }

    const entries: Array<{ key: string; value: string }> = [];
    if (clientId) entries.push({ key: "pluggy_client_id", value: clientId });
    if (clientSecret)
      entries.push({ key: "pluggy_client_secret", value: clientSecret });
    if (webhookSecret)
      entries.push({ key: "pluggy_webhook_secret", value: webhookSecret });
    if (appUrl) entries.push({ key: "public_app_url", value: appUrl });

    if (entries.length === 0) {
      toast.error("Informe pelo menos uma configuração antes de salvar.");
      return;
    }

    try {
      await saveEntries(entries);
      setPluggyClientId("");
      setPluggyClientSecret("");
      setPluggyWebhookSecret("");
      setPublicAppUrl("");
    } catch {
      // O toast de erro já foi exibido por saveEntries.
    }
  };

  const handleTestAsaas = async () => {
    if (!asaasConfigured) {
      toast.error("Salve a chave do Asaas antes de testar a conexão.");
      return;
    }
    setAsaasTestStatus("testing");
    try {
      const result = await asaasTestMutation.mutateAsync();
      if (result.success) {
        setAsaasTestStatus("success");
        toast.success(result.message);
      } else {
        setAsaasTestStatus("error");
        toast.error(result.message);
      }
    } catch (error) {
      setAsaasTestStatus("error");
      toast.error(
        `Falha ao testar Asaas: ${error instanceof Error ? error.message : "erro desconhecido"}`
      );
    } finally {
      window.setTimeout(() => setAsaasTestStatus("idle"), 4000);
    }
  };

  const handleTestPluggy = async () => {
    if (!pluggyConfigured) {
      toast.error(
        "Salve o Client ID e o Client Secret da Pluggy antes de testar."
      );
      return;
    }
    setPluggyTestStatus("testing");
    try {
      const result = await pluggyTestMutation.mutateAsync();
      if (result.success) {
        setPluggyTestStatus("success");
        toast.success(result.message);
      } else {
        setPluggyTestStatus("error");
        toast.error(result.message);
      }
    } catch (error) {
      setPluggyTestStatus("error");
      toast.error(
        `Falha ao testar Pluggy: ${error instanceof Error ? error.message : "erro desconhecido"}`
      );
    } finally {
      window.setTimeout(() => setPluggyTestStatus("idle"), 4000);
    }
  };

  const StatusBadge = ({ configured }: { configured: boolean }) => (
    <div className="flex items-center gap-2 rounded-lg bg-muted p-4">
      {statusLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : configured ? (
        <>
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="text-sm font-medium">Configurado</span>
        </>
      ) : (
        <>
          <AlertCircle className="h-5 w-5 text-yellow-600" />
          <span className="text-sm font-medium">Ainda não configurado</span>
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/admin")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <h1 className="text-xl font-bold">Configurações</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="container py-8">
        <div className="mb-6 flex flex-wrap gap-2">
          <Button
            variant={activeTab === "asaas" ? "default" : "outline"}
            onClick={() => setActiveTab("asaas")}
          >
            Integração Asaas
          </Button>
          <Button
            variant={activeTab === "open-finance" ? "default" : "outline"}
            onClick={() => setActiveTab("open-finance")}
          >
            Open Finance
          </Button>
          <Button
            variant="outline"
            onClick={() => setLocation("/admin/backups")}
          >
            Backups
          </Button>
          <Button
            variant="outline"
            onClick={() => setLocation("/admin/diagnostico")}
          >
            Diagnóstico
          </Button>
        </div>

        {activeTab === "asaas" && (
          <Card>
            <CardHeader>
              <CardTitle>Integração Asaas</CardTitle>
              <CardDescription>
                Cadastre a chave de API e o token do webhook. Os valores são
                armazenados criptografados e nunca são exibidos depois de
                salvos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <StatusBadge configured={asaasConfigured} />
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="asaas-key">Chave de API do Asaas</Label>
                  <Input
                    id="asaas-key"
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      asaasConfigured
                        ? "•••••••• (já configurada)"
                        : "$aact_prod_..."
                    }
                    value={asaasApiKey}
                    onChange={event => setAsaasApiKey(event.target.value)}
                    className="font-mono"
                  />
                  <p className="text-sm text-muted-foreground">
                    Cole uma nova chave apenas para substituir a atual.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="asaas-webhook-token">
                    Token do webhook Asaas
                  </Label>
                  <Input
                    id="asaas-webhook-token"
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      asaasWebhookConfigured
                        ? "•••••••• (já configurado)"
                        : "Token do webhook"
                    }
                    value={asaasWebhookToken}
                    onChange={event => setAsaasWebhookToken(event.target.value)}
                    className="font-mono"
                  />
                  <p className="text-sm text-muted-foreground">
                    Use o mesmo token configurado no webhook da conta Asaas.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSaveAsaas} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Salvar configurações Asaas
                </Button>
                <Button
                  onClick={handleTestAsaas}
                  variant="outline"
                  disabled={asaasTestStatus === "testing" || !asaasConfigured}
                >
                  {asaasTestStatus === "testing" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testando...
                    </>
                  ) : asaasTestStatus === "success" ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                      Conexão OK
                    </>
                  ) : asaasTestStatus === "error" ? (
                    <>
                      <XCircle className="mr-2 h-4 w-4 text-red-500" />
                      Falha na conexão
                    </>
                  ) : (
                    "Testar conexão"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "open-finance" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Open Finance — Pluggy
              </CardTitle>
              <CardDescription>
                Informe as credenciais do aplicativo Pluggy e a URL pública do
                sistema. O usuário final fará o login bancário dentro do Connect
                Widget; o Exclusive Clube não armazena senhas bancárias.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <StatusBadge configured={pluggyConfigured} />
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pluggy-client-id">Pluggy Client ID</Label>
                  <Input
                    id="pluggy-client-id"
                    type="text"
                    autoComplete="off"
                    placeholder={
                      pluggyClientIdStatus.data?.configured
                        ? "•••••••• (já configurado)"
                        : "Client ID"
                    }
                    value={pluggyClientId}
                    onChange={event => setPluggyClientId(event.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pluggy-client-secret">
                    Pluggy Client Secret
                  </Label>
                  <Input
                    id="pluggy-client-secret"
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      pluggyClientSecretStatus.data?.configured
                        ? "•••••••• (já configurado)"
                        : "Client Secret"
                    }
                    value={pluggyClientSecret}
                    onChange={event =>
                      setPluggyClientSecret(event.target.value)
                    }
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pluggy-webhook-secret">
                    Segredo do webhook Pluggy
                  </Label>
                  <Input
                    id="pluggy-webhook-secret"
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      pluggyWebhookConfigured
                        ? "•••••••• (já configurado)"
                        : "Segredo customizado"
                    }
                    value={pluggyWebhookSecret}
                    onChange={event =>
                      setPluggyWebhookSecret(event.target.value)
                    }
                    className="font-mono"
                  />
                  <p className="text-sm text-muted-foreground">
                    Configure o mesmo valor no header{" "}
                    <code>x-pluggy-webhook-secret</code> da Pluggy.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="public-app-url">URL pública HTTPS</Label>
                  <Input
                    id="public-app-url"
                    type="url"
                    autoComplete="url"
                    placeholder={
                      publicAppUrlConfigured
                        ? "•••••••• (já configurada)"
                        : "https://seu-dominio.com"
                    }
                    value={publicAppUrl}
                    onChange={event => setPublicAppUrl(event.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    O webhook será montado como{" "}
                    <code>/api/webhooks/pluggy</code>.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
                Para testar sem risco, use primeiro o ambiente sandbox da
                Pluggy. Depois de salvar, teste a API e só então conecte uma
                conta pelo menu Open Finance.
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSavePluggy} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Salvar configurações Pluggy
                </Button>
                <Button
                  onClick={handleTestPluggy}
                  variant="outline"
                  disabled={pluggyTestStatus === "testing" || !pluggyConfigured}
                >
                  {pluggyTestStatus === "testing" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testando...
                    </>
                  ) : pluggyTestStatus === "success" ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                      API OK
                    </>
                  ) : pluggyTestStatus === "error" ? (
                    <>
                      <XCircle className="mr-2 h-4 w-4 text-red-500" />
                      Falha na API
                    </>
                  ) : (
                    "Testar API Pluggy"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation("/admin/open-finance")}
                >
                  Abrir painel Open Finance
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
