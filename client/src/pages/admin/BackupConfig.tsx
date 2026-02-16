import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, XCircle, Upload, AlertTriangle, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AdminBackupConfig() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: status, isLoading: statusLoading, refetch } = trpc.backupConfig.getStatus.useQuery();
  const saveCredentialsMutation = trpc.backupConfig.saveCredentials.useMutation({
    onSuccess: () => {
      toast.success('Credenciais salvas com sucesso!');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      refetch();
      setIsUploading(false);
    },
    onError: (error) => {
      toast.error(`Erro ao salvar credenciais: ${error.message}`);
      setIsUploading(false);
    },
  });

  const resetConfigMutation = trpc.backupConfig.resetConfig.useMutation({
    onSuccess: () => {
      toast.success('Configuração removida com sucesso');
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao remover configuração: ${error.message}`);
    },
  });

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>Você não tem permissão para acessar esta página.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation('/')}>Voltar para Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.json')) {
        toast.error('Por favor, selecione um arquivo JSON válido');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Selecione um arquivo primeiro');
      return;
    }

    setIsUploading(true);
    try {
      const text = await selectedFile.text();
      await saveCredentialsMutation.mutateAsync({ credentials: text });
    } catch (error: any) {
      toast.error(`Erro ao ler arquivo: ${error.message}`);
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    if (confirm('Tem certeza que deseja remover a configuração? Você precisará configurar novamente.')) {
      resetConfigMutation.mutate();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/admin/backups')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Configuração de Backup</h1>
              <p className="text-sm text-gray-500">Configure as credenciais do Google Drive</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Status Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Status da Configuração</CardTitle>
            <CardDescription>Verifique se as credenciais estão configuradas corretamente</CardDescription>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                <span>Verificando...</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {status?.hasCredentials ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="font-medium">
                    Arquivo de credenciais (credentials.json)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {status?.hasToken ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="font-medium">
                    Token de autenticação OAuth2
                  </span>
                </div>
                <div className="mt-4 pt-4 border-t">
                  {status?.isConfigured ? (
                    <Alert className="bg-green-50 border-green-200">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        ✅ Backup configurado e pronto para uso!
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert className="bg-yellow-50 border-yellow-200">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <AlertDescription className="text-yellow-800">
                        ⚠️ Configuração incompleta. Siga os passos abaixo para configurar.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upload Credentials Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>1. Upload de Credenciais</CardTitle>
            <CardDescription>
              Faça upload do arquivo credentials.json baixado do Google Cloud Console
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
                id="credentials-upload"
              />
              <label
                htmlFor="credentials-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="w-8 h-8 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">
                  {selectedFile ? selectedFile.name : 'Clique para selecionar o arquivo'}
                </span>
                <span className="text-xs text-gray-500">
                  Apenas arquivos .json
                </span>
              </label>
            </div>

            {selectedFile && (
              <Button
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Salvando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Salvar Credenciais
                  </>
                )}
              </Button>
            )}

            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                <strong>Como obter o arquivo credentials.json:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                  <li>Acesse o <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Cloud Console</a></li>
                  <li>Crie um projeto ou selecione um existente</li>
                  <li>Ative a API do Google Drive</li>
                  <li>Crie credenciais OAuth 2.0 para aplicação desktop</li>
                  <li>Baixe o arquivo JSON e faça upload aqui</li>
                </ol>
                <p className="mt-2 text-xs text-gray-600">
                  Consulte o arquivo <code className="bg-gray-100 px-1 py-0.5 rounded">BACKUP-SETUP.md</code> para instruções detalhadas.
                </p>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* OAuth Authentication Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>2. Autenticação OAuth2</CardTitle>
            <CardDescription>
              Após fazer upload das credenciais, execute a autenticação OAuth2
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="bg-blue-50 border-blue-200">
              <AlertTriangle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                <strong>Atenção:</strong> A autenticação OAuth2 precisa ser feita via terminal. 
                Execute o comando: <code className="bg-blue-100 px-2 py-1 rounded">pnpm setup-drive</code>
                <p className="mt-2 text-sm">
                  Isso abrirá uma janela do navegador para você autorizar o acesso ao Google Drive.
                  Após autorizar, o token será salvo automaticamente.
                </p>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Reset Configuration */}
        {status?.hasCredentials && (
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600">Remover Configuração</CardTitle>
              <CardDescription>
                Remove todas as credenciais e tokens salvos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                onClick={handleReset}
                disabled={resetConfigMutation.isPending}
              >
                {resetConfigMutation.isPending ? 'Removendo...' : 'Remover Configuração'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
