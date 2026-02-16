import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, XCircle, Clock, HardDrive, Calendar, Download, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function AdminBackups() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  const { data: stats, isLoading: statsLoading } = trpc.backup.getStats.useQuery();
  const { data: history, isLoading: historyLoading } = trpc.backup.getHistory.useQuery({ limit: 20 });

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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Sucesso</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Falha</Badge>;
      case 'running':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1 animate-spin" />Em Execução</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
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
              onClick={() => setLocation('/admin')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Backups do Sistema</h1>
              <p className="text-sm text-gray-500">Monitoramento e histórico de backups automáticos</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total de Backups</CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                <div className="text-3xl font-bold">{stats?.totalBackups || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Taxa de Sucesso</CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="text-3xl font-bold text-green-600">{stats?.successRate || 0}%</div>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Tamanho Total</CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="text-3xl font-bold">{formatBytes(stats?.totalSizeBytes || 0)}</div>
                  <HardDrive className="w-5 h-5 text-blue-600" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Duração Média</CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="text-3xl font-bold">{formatDuration(stats?.avgDurationSeconds || 0)}</div>
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Último Backup */}
        {stats?.lastBackup && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Último Backup
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Status</div>
                  {getStatusBadge(stats.lastBackup.status)}
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Data/Hora</div>
                  <div className="font-medium">
                    {new Date(stats.lastBackup.startedAt).toLocaleString('pt-BR')}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(stats.lastBackup.startedAt), { addSuffix: true, locale: ptBR })}
                  </div>
                </div>
                {stats.lastBackup.fileName && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Arquivo</div>
                    <div className="font-medium text-sm">{stats.lastBackup.fileName}</div>
                    {stats.lastBackup.fileSizeBytes && (
                      <div className="text-xs text-gray-500">{formatBytes(stats.lastBackup.fileSizeBytes)}</div>
                    )}
                  </div>
                )}
                {stats.lastBackup.driveFileUrl && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Ações</div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(stats.lastBackup!.driveFileUrl!, '_blank')}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Baixar
                    </Button>
                  </div>
                )}
              </div>
              {stats.lastBackup.status === 'failed' && stats.lastBackup.errorMessage && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                      <div className="font-medium text-red-900 mb-1">Erro</div>
                      <div className="text-sm text-red-700">{stats.lastBackup.errorMessage}</div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Histórico */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Backups</CardTitle>
            <CardDescription>Últimos 20 backups executados</CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 bg-gray-200 rounded animate-pulse"></div>
                ))}
              </div>
            ) : history && history.length > 0 ? (
              <div className="space-y-4">
                {history.map((backup) => (
                  <div
                    key={backup.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {getStatusBadge(backup.status)}
                          <span className="text-sm text-gray-600">
                            {new Date(backup.startedAt).toLocaleString('pt-BR')}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(backup.startedAt), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          {backup.fileName && (
                            <div>
                              <span className="text-gray-600">Arquivo:</span>{' '}
                              <span className="font-medium">{backup.fileName}</span>
                            </div>
                          )}
                          {backup.fileSizeBytes && (
                            <div>
                              <span className="text-gray-600">Tamanho:</span>{' '}
                              <span className="font-medium">{formatBytes(backup.fileSizeBytes)}</span>
                            </div>
                          )}
                          {backup.durationSeconds && (
                            <div>
                              <span className="text-gray-600">Duração:</span>{' '}
                              <span className="font-medium">{formatDuration(backup.durationSeconds)}</span>
                            </div>
                          )}
                        </div>

                        {backup.status === 'failed' && backup.errorMessage && (
                          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                            <strong>Erro:</strong> {backup.errorMessage}
                          </div>
                        )}
                      </div>

                      {backup.driveFileUrl && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(backup.driveFileUrl!, '_blank')}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <HardDrive className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum backup encontrado</p>
                <p className="text-sm mt-2">Os backups automáticos serão exibidos aqui após a primeira execução</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
