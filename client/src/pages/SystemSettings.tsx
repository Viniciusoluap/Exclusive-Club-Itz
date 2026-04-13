import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, Save, AlertCircle, CheckCircle2, ArrowLeft, XCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function SystemSettings() {
  const [, setLocation] = useLocation();
  const [asaasApiKey, setAsaasApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");

  // Buscar chave atual (apenas para verificar se existe)
  const { data: currentKey, isLoading } = trpc.systemSettings.get.useQuery({
    key: "asaas_api_key",
  });

  // Mutation para salvar chave
  const saveMutation = trpc.systemSettings.set.useMutation({
    onSuccess: () => {
      toast.success("Chave API salva com sucesso!");
      setIsSaving(false);
      setAsaasApiKey(""); // Limpar campo por segurança
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
      setIsSaving(false);
    },
  });

  const handleSave = async () => {
    if (!asaasApiKey.trim()) {
      toast.error("Por favor, insira a chave API");
      return;
    }

    if (!asaasApiKey.startsWith("$aact_")) {
      toast.error("Chave API inválida. Deve começar com $aact_");
      return;
    }

    setIsSaving(true);
    saveMutation.mutate({
      key: "asaas_api_key",
      value: asaasApiKey,
      description: "Chave de API do Asaas para processamento de pagamentos via PIX",
    });
  };

  const testMutation = trpc.systemSettings.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setTestStatus("success");
        toast.success(data.message);
      } else {
        setTestStatus("error");
        toast.error(data.message);
      }
      setTimeout(() => setTestStatus("idle"), 4000);
    },
    onError: (err) => {
      setTestStatus("error");
      toast.error(`Erro ao testar conexão: ${err.message}`);
      setTimeout(() => setTestStatus("idle"), 4000);
    },
  });

  const handleTest = async () => {
    if (!currentKey?.value && !asaasApiKey) {
      toast.error("Configure e salve a chave API antes de testar");
      return;
    }
    setTestStatus("testing");
    testMutation.mutate();
  };

  const [activeTab, setActiveTab] = useState<"asaas" | "backups">("asaas");

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-background border-b sticky top-0 z-40">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/admin")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <h1 className="text-xl font-bold">Configurações</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="container py-8">
        {/* Submenu */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <Button
            variant={activeTab === "asaas" ? "default" : "outline"}
            onClick={() => setActiveTab("asaas")}
          >
            Integração Asaas
          </Button>
          <Button
            variant={activeTab === "backups" ? "default" : "outline"}
            onClick={() => setLocation("/admin/backups")}
          >
            Backups
          </Button>
        </div>

        {/* Conteúdo */}
        {activeTab === "asaas" && (
          <div>

      {/* Alert sobre workaround */}
      <Alert className="mb-6 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
        <AlertCircle className="h-4 w-4 text-yellow-600" />
        <AlertDescription className="text-yellow-800 dark:text-yellow-200">
          <strong>Workaround Temporário:</strong> Devido a um bug do sistema Manus, a chave API do Asaas
          configurada no painel de Secrets não está sendo carregada. Esta interface permite configurar
          a chave diretamente no banco de dados até o problema ser resolvido.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Integração Asaas (Pagamentos PIX)</CardTitle>
          <CardDescription>
            Configure a chave de API do Asaas para processar pagamentos via PIX
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status da chave atual */}
          <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : currentKey?.value ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium">Chave API configurada</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <span className="text-sm font-medium">Nenhuma chave configurada</span>
              </>
            )}
          </div>

          {/* Campo para nova chave */}
          <div className="space-y-2">
            <Label htmlFor="asaas-key">Chave de API do Asaas</Label>
            <Input
              id="asaas-key"
              type="password"
              placeholder="$aact_prod_... ou $aact_YTU5..."
              value={asaasApiKey}
              onChange={(e) => setAsaasApiKey(e.target.value)}
              className="font-mono"
            />
            <p className="text-sm text-muted-foreground">
              Acesse{" "}
              <a
                href="https://www.asaas.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                asaas.com
              </a>{" "}
              → Integrações → API para obter sua chave
            </p>
          </div>

          {/* Instruções */}
          <div className="space-y-2 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-100">
              📋 Como configurar:
            </h4>
            <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
              <li>Acesse sua conta no Asaas</li>
              <li>Vá em <strong>Integrações</strong> → <strong>API</strong></li>
              <li>Copie sua <strong>Chave de API</strong> completa</li>
              <li>Cole no campo acima e clique em <strong>Salvar</strong></li>
            </ol>
          </div>

          {/* Botões de ação */}
          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              disabled={isSaving || !asaasApiKey}
              className="flex-1"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Chave API
                </>
              )}
            </Button>

            <Button
              onClick={handleTest}
              variant="outline"
              disabled={testStatus === "testing" || (!currentKey?.value && !asaasApiKey)}
            >
              {testStatus === "testing" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testando...
                </>
              ) : testStatus === "success" ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                  Conexão OK
                </>
              ) : testStatus === "error" ? (
                <>
                  <XCircle className="mr-2 h-4 w-4 text-red-500" />
                  Falha na Conexão
                </>
              ) : (
                "Testar Conexão"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
          </div>
        )}
      </div>
    </div>
  );
}
