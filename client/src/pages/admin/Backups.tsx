import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/hooks/useConfirm";
import { PageLoader } from "@/components/PageLoader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, XCircle, Clock, HardDrive, Calendar, Download, AlertTriangle, Play, Trash2, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useState } from "react";

export default function AdminBackups() {
  const { user, loading } = useAuth();
  const confirm = useConfirm();
  const [, setLocation] = useLocation();

  const utils = trpc.useUtils();

  const runBackupMutation = trpc.backup.runNow.useMutation({
    onSuccess: () => {
      toast.info('Backup iniciado em segundo plano. Acompanhe o progresso abaixo.');
      utils.backup.getStats.invalidate();
      utils.backup.getHistory.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao iniciar backup: ${error.message}`);
    },
  });

  // Índice dos anexos: baixado sob demanda, não junto com a tela.
  // São 238 linhas que só interessam na hora de conferir ou recuperar.
  const utilsIndice = trpc.useUtils();
  const [baixandoIndice, setBaixandoIndice] = useState(false);

  const handleBaixarIndice = async () => {
    setBaixandoIndice(true);
    try {
      const linhas = await utilsIndice.backup.listArchivedAttachments.fetch();
      if (linhas.length === 0) {
        toast.info('Nenhum anexo arquivado ainda.');
        return;
      }

      const escapar = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const cabecalho = ['categoria', 'arquivo', 'origem', 'armazenamento', 'bytes', 'situacao', 'erro', 'arquivadoEm'];
      const csv = [
        cabecalho.join(','),
        ...linhas.map((l) => cabecalho.map((c) => escapar((l as any)[c])).join(',')),
      ].join('\n');

      // BOM: sem ele o Excel abre os acentos errados.
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `indice-anexos-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Índice de ${linhas.length} anexo(s) baixado.`);
    } catch (e: any) {
      toast.error(`Erro ao baixar índice: ${e.message}`);
    } finally {
      setBaixandoIndice(false);
    }
  };

  // ---- Limpeza dos backups redundantes ----
  // Um defeito disparava um backup a cada start do servidor, e a hospedagem
  // recicla a instância com frequência: 313 backups numa noite. A regra mantém
  // o mais recente de cada dia, então nenhum dia fica descoberto.
  const { data: cleanupPreview } = trpc.backup.getCleanupPreview.useQuery();
  const cleanupMutation = trpc.backup.cleanupRedundant.useMutation({
    onSuccess: ({ removidos }) => {
      toast.success(`${removidos} backup(s) redundante(s) removido(s).`);
      utils.backup.getStats.invalidate();
      utils.backup.getHistory.invalidate();
      utils.backup.getCleanupPreview.invalidate();
    },
    onError: (error) => toast.error(`Erro ao limpar: ${error.message}`),
  });

  const handleCleanup = async () => {
    if (!cleanupPreview || cleanupPreview.total === 0) return;
    const ok = await confirm({
      title: 'Remover backups redundantes?',
      description:
        `Serão removidos ${cleanupPreview.total} registro(s): ${cleanupPreview.duplicados} ` +
        `repetição(ões) do mesmo dia e ${cleanupPreview.falhasAntigas} falha(s) antiga(s). ` +
        `Restarão ${cleanupPreview.restantes}, mantendo o backup mais recente de cada dia. ` +
        `Os arquivos já enviados ao armazenamento externo não são apagados — apenas o registro sai da lista.`,
      variant: 'destructive',
      confirmText: 'Remover',
    });
    if (ok) cleanupMutation.mutate();
  };

  // Zerar o histórico. Separado da limpeza acima porque não preserva nada —
  // e porque, entre apagar tudo e o próximo backup, não existe ponto de
  // restauração. Por isso o servidor inicia um backup novo logo em seguida.
  const cleanupAllMutation = trpc.backup.cleanupAll.useMutation({
    onSuccess: ({ removidos }) => {
      toast.success(`${removidos} backup(s) removido(s). Um backup novo já foi iniciado.`);
      utils.backup.getStats.invalidate();
      utils.backup.getHistory.invalidate();
      utils.backup.getCleanupPreview.invalidate();
    },
    onError: (error) => toast.error(`Erro ao limpar histórico: ${error.message}`),
  });

  const handleCleanupAll = async () => {
    const total = stats?.totalBackups ?? 0;
    const ok = await confirm({
      title: 'Apagar todo o histórico de backups?',
      description:
        `Todos os ${total} registros serão removidos e um backup novo será iniciado em seguida, ` +
        `para o sistema não ficar sem nenhum ponto de restauração. ` +
        `Os arquivos já enviados ao armazenamento externo não são apagados — apenas saem da lista. ` +
        `Esta ação não pode ser desfeita.`,
      variant: 'destructive',
      confirmText: 'Apagar tudo e recomeçar',
    });
    if (ok) cleanupAllMutation.mutate();
  };

  // ---- Arquivamento incremental de ANEXOS ----
  // Fotos e documentos NÃO entram no zip do backup: baixá-los junto fazia o
  // processo passar de 43s para minutos, e o trabalho em segundo plano não
  // sobrevive tanto tempo nesta hospedagem — o backup morria no meio. Aqui eles
  // são arquivados em lotes curtos, e cada arquivo é processado uma única vez.
  const { data: attachProgress } = trpc.backup.getAttachmentsProgress.useQuery();
  const archiveMutation = trpc.backup.archiveAttachmentsBatch.useMutation();
  const [archiving, setArchiving] = useState(false);
  // Progresso ao vivo no próprio botão. Antes o andamento só aparecia em toasts
  // a cada 4 lotes, então a tela ficava muda por longos períodos e não dava
  // para saber se ainda estava trabalhando ou se tinha travado.
  const [archiveStatus, setArchiveStatus] = useState<string | null>(null);

  const handleArchiveAttachments = async () => {
    setArchiving(true);
    setArchiveStatus(null);
    const MAX_LOTES = 400; // trava de segurança contra laço infinito

    // Uma falha de rede num lote não perde o que já foi feito: cada anexo
    // arquivado está gravado no banco. Então vale tentar de novo antes de
    // desistir — e, ao desistir, deixar claro que o progresso está guardado.
    let falhasSeguidas = 0;

    try {
      for (let i = 0; i < MAX_LOTES; i++) {
        let p: Awaited<ReturnType<typeof archiveMutation.mutateAsync>>;
        try {
          p = await archiveMutation.mutateAsync();
          falhasSeguidas = 0;
        } catch (e: any) {
          falhasSeguidas++;
          if (falhasSeguidas >= 4) {
            toast.error(
              `Interrompido: ${e.message} — o que já foi arquivado está salvo, e o servidor continua arquivando sozinho em segundo plano. Não é preciso fazer nada.`,
            );
            return;
          }
          // HTTP 503 quer dizer "estou ocupado, tente mais tarde". A tentativa
          // anterior repetia na mesma hora, 3 vezes em cerca de um segundo —
          // ou seja, insistia exatamente quando a instância tinha menos
          // capacidade para responder. Espera crescente dá tempo de ela voltar.
          const esperaMs = 2000 * 2 ** (falhasSeguidas - 1); // 2s, 4s, 8s
          setArchiveStatus(`Servidor ocupado. Nova tentativa em ${esperaMs / 1000}s…`);
          await new Promise((r) => setTimeout(r, esperaMs));
          continue;
        }

        setArchiveStatus(
          p.done
            ? null
            : `Arquivando… ${p.archived} de ${p.total}` +
                (p.failed > 0 ? ` — ${p.failed} com falha` : ''),
        );

        if (p.done) {
          toast.success(
            `Anexos arquivados: ${p.archived} de ${p.total}` +
              (p.failed > 0 ? ` — ${p.failed} com falha` : ''),
          );
          return;
        }

        // Nenhum item processado e ainda há pendentes: repetir só gastaria
        // requisição à toa. Melhor parar dizendo isso do que girar em falso.
        if (p.processedNow === 0) {
          toast.warning(`Nenhum anexo pôde ser processado. Restam ${p.remaining}.`);
          return;
        }
      }
      toast.warning('Pausado por segurança. Clique novamente para continuar.');
    } finally {
      setArchiving(false);
      setArchiveStatus(null);
      utils.backup.getAttachmentsProgress.invalidate();
    }
  };

  // Polling enquanto há backup em execução.
  //
  // 2s (era 5s) porque agora existe uma barra de progresso para acompanhar: a
  // cada 5 segundos a barra dava saltos e parecia travada entre uma atualização
  // e outra. Um backup dura ~25s, então o custo de consultar de 2 em 2 segundos
  // é de pouco mais de dez consultas — e só enquanto algo está rodando.
  const POLL_MS = 2000;
  const { data: stats, isLoading: statsLoading } = trpc.backup.getStats.useQuery(undefined, {
    refetchInterval: (query) => {
      const d = query.state.data as any;
      return d?.runningBackups > 0 ? POLL_MS : false;
    },
  });
  const { data: history, isLoading: historyLoading } = trpc.backup.getHistory.useQuery({ limit: 20 }, {
    refetchInterval: (query) => {
      const d = query.state.data as any;
      return Array.isArray(d) && d.some((b: any) => b.status === 'running') ? POLL_MS : false;
    },
  });

  // Desabilita o botão enquanto há backup em execução (pelo histórico ou pela mutation em andamento)
  const isRunningBackup = runBackupMutation.isPending || (history ?? []).some((b: any) => b.status === 'running');

  const handleRunBackup = () => {
    if (isRunningBackup) return;
    toast.info('Iniciando backup... Isso pode levar alguns minutos.');
    runBackupMutation.mutate();
  };

  const deleteBackupMutation = trpc.backup.deleteBackup.useMutation({
    onSuccess: () => {
      toast.success('Backup excluído com sucesso!');
      utils.backup.getStats.invalidate();
      utils.backup.getHistory.invalidate();
      utils.backup.getLatest.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao excluir backup: ${error.message}`);
    },
  });

  const restoreBackupMutation = trpc.backup.restoreBackup.useMutation({
    onSuccess: () => {
      toast.success('Backup restaurado com sucesso! O banco de dados foi restaurado.');
    },
    onError: (error) => {
      toast.error(`Erro ao restaurar backup: ${error.message}`);
    },
  });

  const handleDelete = async (backupId: number) => {
    if (await confirm({
      title: "Excluir backup",
      description: "Tem certeza que deseja excluir este backup? Esta ação não pode ser desfeita.",
      variant: "destructive",
      confirmText: "Excluir",
    })) {
      deleteBackupMutation.mutate({ backupId });
    }
  };

  const handleRestore = async (backupId: number) => {
    if (await confirm({
      title: "Restaurar backup",
      description: "Tem certeza que deseja restaurar este backup? O banco de dados atual será SUBSTITUÍDO. Esta ação não pode ser desfeita.",
      variant: "destructive",
      confirmText: "Restaurar",
    })) {
      toast.info('Iniciando restauração... Isso pode levar alguns minutos.');
      restoreBackupMutation.mutate({ backupId });
    }
  };

  if (loading || !user) {
    return <PageLoader />;
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

  /**
   * Barra de progresso do backup em andamento.
   *
   * POR QUE SUBSTITUI O "Em Execução": aquele rótulo não distinguia
   * "trabalhando normalmente" de "travado" — e travar já aconteceu aqui mais de
   * uma vez. Um número que avança é a diferença entre acompanhar e torcer.
   *
   * O percentual vem do servidor e reflete etapas concluídas, não tempo
   * decorrido. Uma barra cronometrada continuaria subindo com o processo morto,
   * que é justamente o que ela deveria denunciar.
   */
  const ProgressoBackup = ({ backup }: { backup: any }) => {
    const percent = typeof backup.progressPercent === 'number' ? backup.progressPercent : null;
    const step = backup.progressStep as string | null;

    return (
      <div className="w-full">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-sm font-medium text-teal-700 flex items-center gap-1.5 min-w-0">
            <Clock className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span className="truncate">{step ?? 'Em execução'}</span>
          </span>
          {percent !== null && (
            <span className="text-sm font-bold text-teal-700 tabular-nums shrink-0">{percent}%</span>
          )}
        </div>

        <div
          className="h-2 w-full rounded-full bg-gray-200 overflow-hidden"
          role="progressbar"
          aria-valuenow={percent ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={step ?? 'Backup em execução'}
        >
          <div
            className={
              percent === null
                ? // Sem percentual (backup começado antes desta versão): faixa
                  // animada, para não fingir um número que não existe.
                  'h-full w-1/3 bg-teal-500 animate-pulse'
                : 'h-full bg-teal-500 transition-all duration-500'
            }
            style={percent === null ? undefined : { width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      </div>
    );
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
        {/*
          No celular o título e os dois botões não cabem lado a lado: a linha
          ficava mais larga que a tela, empurrando a página inteira para o lado
          e cortando o conteúdo. Abaixo de `sm` tudo empilha e os botões ocupam
          a largura toda; a partir de `sm` volta ao layout lado a lado.
        */}
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 px-2 sm:px-3"
              onClick={() => setLocation('/admin')}
            >
              <ArrowLeft className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Voltar</span>
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">Backups do Sistema</h1>
              <p className="text-xs sm:text-sm text-gray-500 truncate">Monitoramento e histórico de backups automáticos</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:shrink-0">
            <Button
              onClick={handleRunBackup}
              disabled={isRunningBackup}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            >
              {isRunningBackup ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  Executando...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Executar Backup Agora
                </>
              )}
            </Button>

            <Button
              onClick={handleArchiveAttachments}
              disabled={archiving}
              variant="outline"
              className="w-full sm:w-auto"
              title="Fotos e documentos são arquivados separadamente, em lotes, para não derrubar o backup do banco."
            >
              {archiving ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin shrink-0" />
                  {archiveStatus ?? 'Arquivando anexos...'}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Arquivar anexos
                  {attachProgress ? ` (${attachProgress.archived}/${attachProgress.total})` : ''}
                </>
              )}
            </Button>

            {/* Só aparece quando há o que limpar — sem redundância, sem botão. */}
            {cleanupPreview && cleanupPreview.total > 0 && (
              <Button
                onClick={handleCleanup}
                disabled={cleanupMutation.isPending}
                variant="outline"
                className="w-full sm:w-auto text-red-600 hover:text-red-700"
                title="Mantém o backup mais recente de cada dia e remove as repetições."
              >
                <Trash2 className="w-4 h-4 mr-2 shrink-0" />
                Limpar redundantes ({cleanupPreview.total})
              </Button>
            )}
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

        {/*
          Anexos arquivados.

          POR QUE ESTE CARD EXISTE: o zip do backup tem ~320 KB, o que parece
          pouco demais para quem espera encontrar as fotos e documentos ali
          dentro. Eles ficam FORA do zip de propósito — juntá-los fazia o
          backup inteiro morrer no meio do caminho e nada era salvo, nem o
          banco. Sem este card, "os anexos estão salvos" era uma afirmação sem
          nenhuma prova visível.
        */}
        {attachProgress && attachProgress.total > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 shrink-0" />
                Anexos (fotos e documentos)
              </CardTitle>
              <CardDescription>
                Arquivados separadamente do banco, criptografados. Não estão dentro do zip do backup.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Arquivados</div>
                  <div className="text-2xl font-bold">
                    {attachProgress.archived} <span className="text-base font-normal text-gray-500">de {attachProgress.total}</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Volume</div>
                  <div className="text-2xl font-bold">{formatBytes(attachProgress.archivedBytes)}</div>
                </div>
                {attachProgress.failed > 0 && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Com falha</div>
                    <div className="text-2xl font-bold text-red-600">{attachProgress.failed}</div>
                  </div>
                )}
              </div>

              <Button
                onClick={handleBaixarIndice}
                disabled={baixandoIndice}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                title="Planilha com origem, destino e tamanho de cada anexo — o mapa para recuperá-los."
              >
                <Download className="w-4 h-4 mr-2 shrink-0" />
                {baixandoIndice ? 'Gerando…' : 'Baixar índice dos anexos'}
              </Button>
            </CardContent>
          </Card>
        )}

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
                <div className={stats.lastBackup.status === 'running' ? 'sm:col-span-2 lg:col-span-4' : ''}>
                  <div className="text-sm text-gray-600 mb-1">Status</div>
                  {stats.lastBackup.status === 'running' ? (
                    <ProgressoBackup backup={stats.lastBackup} />
                  ) : (
                    getStatusBadge(stats.lastBackup.status)
                  )}
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Data/Hora</div>
                  <div className="font-medium">
                    {new Date(stats.lastBackup.startedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(stats.lastBackup.startedAt), { addSuffix: true, locale: ptBR })}
                  </div>
                </div>
                {stats.lastBackup.fileName && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Arquivo</div>
                    <div className="font-medium text-sm break-all">{stats.lastBackup.fileName}</div>
                    {stats.lastBackup.fileSizeBytes && (
                      <div className="text-xs text-gray-500">{formatBytes(stats.lastBackup.fileSizeBytes)}</div>
                    )}
                  </div>
                )}
                {stats.lastBackup.status === 'success' && stats.lastBackup.localFilePath && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Ações</div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`/api/backup/download/${stats.lastBackup!.id}`, '_blank')}
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
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-red-900 mb-1">Erro</div>
                      <div className="text-sm text-red-700 break-words">{stats.lastBackup.errorMessage}</div>
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
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>Histórico de Backups</CardTitle>
                <CardDescription>Últimos 20 backups executados</CardDescription>
              </div>
              {(stats?.totalBackups ?? 0) > 0 && (
                <Button
                  onClick={handleCleanupAll}
                  disabled={cleanupAllMutation.isPending}
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto shrink-0 text-red-600 hover:text-red-700"
                  title="Apaga todo o histórico e inicia um backup novo em seguida."
                >
                  <Trash2 className="w-4 h-4 mr-2 shrink-0" />
                  {cleanupAllMutation.isPending ? 'Limpando…' : 'Apagar tudo e recomeçar'}
                </Button>
              )}
            </div>
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
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 w-full">
                        {backup.status === 'running' && (
                          <div className="mb-3">
                            <ProgressoBackup backup={backup} />
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                          {backup.status !== 'running' && getStatusBadge(backup.status)}
                          <span className="text-sm text-gray-600">
                            {new Date(backup.startedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(backup.startedAt), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          {backup.fileName && (
                            <div className="min-w-0">
                              <span className="text-gray-600">Arquivo:</span>{' '}
                              {/* Nome sem espaços; sem break-all ele estica a linha além da tela. */}
                              <span className="font-medium break-all">{backup.fileName}</span>
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

                      <div className="flex gap-2 shrink-0 self-end sm:self-start">
                        {/* Botões para backups com sucesso */}
                        {backup.status === 'success' && (backup.s3Url || backup.localFilePath) && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(`/api/backup/download/${backup.id}`, '_blank')}
                              title="Baixar backup"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRestore(backup.id)}
                              title="Restaurar backup"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        
                        {/* Botão Excluir para TODOS os backups */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (backup.status === 'running') {
                              if (!(await confirm({
                                title: "Backup em execução",
                                description: "Este backup pode ainda estar em execução. Excluir mesmo assim?",
                                variant: "destructive",
                                confirmText: "Excluir mesmo assim",
                              }))) return;
                            }
                            handleDelete(backup.id);
                          }}
                          title="Excluir backup"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
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
