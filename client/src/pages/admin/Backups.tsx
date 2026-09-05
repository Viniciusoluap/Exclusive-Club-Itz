import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/hooks/useConfirm";
import { PageLoader } from "@/components/PageLoader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle2, XCircle, Clock, HardDrive, Calendar, Download, AlertTriangle, Play, Trash2, RotateCcw, Search } from "lucide-react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useState } from "react";

/**
 * Nome do arquivo como ele CHEGA para quem baixa.
 *
 * No armazenamento o artefato termina em `.zip.enc`, porque lá ele está mesmo
 * criptografado. Mas o servidor descriptografa antes de entregar, e o download
 * sai `.zip`. Mostrar `.zip.enc` na tela fazia a tela contradizer o download —
 * a pessoa lia que ia receber um `.enc` e não tinha como saber que não ia.
 */
function nomeDoDownload(fileName: string): string {
  return fileName.replace(/\.enc$/i, '');
}

type RelatorioTabelaMesclagem = {
  table: string;
  label: string;
  hasNaturalKey: boolean;
  rowsInBackup: number;
  rowsCurrentlyInProduction: number;
  rowsAlreadyExisting: number;
  rowsToInsert: number;
  rowsWithoutKeyValue: number;
  rowsInsertableById?: number;
  error?: string;
};

type RelatorioMesclagem = {
  generatedAt: string;
  tables: RelatorioTabelaMesclagem[];
  tablesInBackupNotRecognized: string[];
  totalRowsToInsert: number;
};

type ResultadoTabelaAplicacaoMesclagem = {
  table: string;
  label: string;
  rowsAttempted: number;
  rowsInserted: number;
  rowsVerified: number;
  success: boolean;
  error?: string;
};

type ResultadoAplicacaoMesclagem = {
  appliedAt: string;
  tables: ResultadoTabelaAplicacaoMesclagem[];
  totalRowsInserted: number;
  allSucceeded: boolean;
  tablesNeverAutoInserted: string[];
};

type ResultadoTabelaRecuperacaoForcada = {
  table: string;
  label: string;
  rowsInBackup: number;
  rowsSkippedExistingId: number;
  rowsAttempted: number;
  rowsInserted: number;
  rowsVerified: number;
  success: boolean;
  error?: string;
};

type ResultadoRecuperacaoForcada = {
  appliedAt: string;
  tables: ResultadoTabelaRecuperacaoForcada[];
  totalRowsInserted: number;
  allSucceeded: boolean;
};

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

  /**
   * Busca e recuperação individual de um anexo arquivado.
   *
   * POR QUE EXISTE: até 05/09/2026 o índice só podia ser CONSULTADO (CSV) —
   * não havia como pegar de volta o arquivo em si. Um administrador com uma
   * URL de foto/documento quebrada (ex.: documento pessoal de um cliente após
   * a recuperação seletiva do backup) não tinha nenhuma forma de recuperar o
   * arquivo. Esta busca simples resolve o caso de "preciso deste aqui, agora".
   */
  const [buscaAnexo, setBuscaAnexo] = useState('');
  const [buscandoAnexo, setBuscandoAnexo] = useState(false);
  const [anexosEncontrados, setAnexosEncontrados] = useState<
    Awaited<ReturnType<typeof utilsIndice.backup.listArchivedAttachments.fetch>> | null
  >(null);

  const handleBuscarAnexos = async () => {
    setBuscandoAnexo(true);
    try {
      const linhas = await utilsIndice.backup.listArchivedAttachments.fetch();
      const termo = buscaAnexo.trim().toLowerCase();
      const filtradas = termo
        ? linhas.filter((l) =>
            [l.categoria, l.arquivo, l.origem].some((v) => String(v ?? '').toLowerCase().includes(termo)),
          )
        : linhas;
      setAnexosEncontrados(filtradas);
      if (filtradas.length === 0) toast.info('Nenhum anexo encontrado com esse termo.');
    } catch (e: any) {
      toast.error(`Erro ao buscar anexos: ${e.message}`);
    } finally {
      setBuscandoAnexo(false);
    }
  };

  const handleBaixarAnexo = (id: number) => {
    window.open(`/api/backup/attachments/${id}/download`, '_blank');
  };

  // ---- Conferência do conteúdo do backup ----
  // Todo o resto prova que o backup é GERADO. Isto prova que ele CONTÉM o que
  // deveria: abre o arquivo de verdade e compara com o banco vivo, tabela por
  // tabela. Não restaura e não altera nada.
  const verifyMutation = trpc.backup.verifyBackup.useMutation({
    onError: (error) => toast.error(`Erro ao conferir: ${error.message}`),
  });
  const relatorio = verifyMutation.data;

  // ---- Recuperação seletiva de um backup antigo (mesclagem, nunca sobrescreve) ----
  // Upload direto (fora do tRPC, por causa do tamanho do arquivo) para
  // /api/backup/restore-merge/*. Sempre em duas etapas: primeiro o dry-run
  // (só lê e compara), e o "Aplicar" só fica disponível depois de um dry-run
  // bem-sucedido do MESMO arquivo selecionado — trocar o arquivo invalida o
  // resultado anterior, para nunca aplicar um relatório que não é deste arquivo.
  const [mergeFile, setMergeFile] = useState<File | null>(null);
  const [mergeDryRun, setMergeDryRun] = useState<RelatorioMesclagem | null>(null);
  const [mergeApplyResult, setMergeApplyResult] = useState<ResultadoAplicacaoMesclagem | null>(null);
  const [mergeDryRunLoading, setMergeDryRunLoading] = useState(false);
  const [mergeApplyLoading, setMergeApplyLoading] = useState(false);
  const [forceRestoreResult, setForceRestoreResult] = useState<ResultadoRecuperacaoForcada | null>(null);
  const [forceRestoreLoading, setForceRestoreLoading] = useState(false);

  /**
   * `response.json()` direto quebra com "Unexpected token <" quando o
   * servidor responde algo que não é JSON (erro 502/504 de proxy, timeout,
   * payload grande demais) — e essa mensagem crua é exatamente o tipo de
   * "log confuso" que a tela não pode deixar vazar. Lê como texto primeiro e
   * só then tenta interpretar como JSON, com uma mensagem clara se falhar.
   */
  async function parseJsonResponse(response: Response): Promise<any> {
    const texto = await response.text();
    try {
      return JSON.parse(texto);
    } catch {
      throw new Error(
        `O servidor respondeu algo inesperado (HTTP ${response.status}). ` +
          'Provavelmente o arquivo é grande demais para o tempo do proxy, ou a conexão caiu no meio. Tente novamente.',
      );
    }
  }

  const handleMergeFileChange = (file: File | null) => {
    setMergeFile(file);
    setMergeDryRun(null);
    setMergeApplyResult(null);
    setForceRestoreResult(null);
  };

  const handleMergeDryRun = async () => {
    if (!mergeFile) return;
    setMergeDryRunLoading(true);
    setMergeApplyResult(null);
    try {
      const formData = new FormData();
      formData.append('file', mergeFile);
      const response = await fetch('/api/backup/restore-merge/dry-run', { method: 'POST', body: formData });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error ?? 'Falha ao analisar o backup.');
      setMergeDryRun(data);
      toast.success(`Análise concluída: ${data.totalRowsToInsert} registro(s) seriam inseridos.`);
    } catch (e: any) {
      toast.error(`Erro ao analisar backup: ${e.message}`);
    } finally {
      setMergeDryRunLoading(false);
    }
  };

  const handleMergeApply = async () => {
    if (!mergeFile || !mergeDryRun) return;
    const ok = await confirm({
      title: 'Aplicar recuperação do backup?',
      description:
        `Serão inseridos até ${mergeDryRun.totalRowsToInsert} registro(s) que existem no backup e ainda não existem hoje. ` +
        'Nenhum dado atual é alterado ou apagado — em caso de conflito, o dado atual sempre prevalece. ' +
        'Tabelas sem uma chave de identificação segura nunca são inseridas automaticamente.',
      confirmText: 'Aplicar',
    });
    if (!ok) return;

    setMergeApplyLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', mergeFile);
      const response = await fetch('/api/backup/restore-merge/apply', { method: 'POST', body: formData });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error ?? 'Falha ao aplicar a recuperação.');
      setMergeApplyResult(data);
      if (data.allSucceeded) {
        toast.success(`Recuperação aplicada e confirmada: ${data.totalRowsInserted} registro(s) inserido(s).`);
      } else {
        toast.warning('Aplicado com pendência: pelo menos uma tabela não confirmou. Veja o detalhe na tela.');
      }
    } catch (e: any) {
      toast.error(`Erro ao aplicar recuperação: ${e.message}`);
    } finally {
      setMergeApplyLoading(false);
    }
  };

  /**
   * Recuperação forçada das tabelas SEM chave natural (vistorias,
   * abastecimentos, reservas, despesas etc.) — insere por id, pulando só o
   * que já existe com o MESMO id. Diferente do "Aplicar" de cima, aqui pode
   * haver duplicata de CONTEÚDO (o mesmo evento recadastrado depois com outro
   * id) — risco aceito explicitamente pelo responsável para priorizar
   * recuperar o dado, inclusive porque os anexos (fotos/documentos) só voltam
   * a ser arquiváveis quando estas tabelas tiverem os registros de volta.
   */
  const handleForceRestore = async () => {
    if (!mergeFile) return;
    const ok = await confirm({
      title: 'Recuperar tabelas sem chave mesmo assim?',
      description:
        'Estas tabelas (vistorias, abastecimentos, reservas, cotas, manutenções, avaliações, despesas etc.) não têm ' +
        'um jeito seguro de saber se um registro do backup já existe hoje sob outro id. A ferramenta só evita colidir ' +
        'com um id que já existe — nunca sobrescreve — mas PODE duplicar um evento que foi recadastrado manualmente ' +
        'depois do backup. Use quando recuperar o dado (inclusive para os anexos voltarem a ser encontráveis) for mais ' +
        'importante do que esse risco.',
      variant: 'destructive',
      confirmText: 'Recuperar mesmo assim',
    });
    if (!ok) return;

    setForceRestoreLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', mergeFile);
      const response = await fetch('/api/backup/restore-merge/force-no-key', { method: 'POST', body: formData });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error ?? 'Falha ao recuperar as tabelas sem chave.');
      setForceRestoreResult(data);
      if (data.allSucceeded) {
        toast.success(`Recuperação forçada concluída e confirmada: ${data.totalRowsInserted} registro(s) inserido(s).`);
      } else {
        toast.warning('Concluído com pendência: pelo menos uma tabela não confirmou. Veja o detalhe na tela.');
      }
    } catch (e: any) {
      toast.error(`Erro na recuperação forçada: ${e.message}`);
    } finally {
      setForceRestoreLoading(false);
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

              {/*
                Recuperar um anexo específico.

                POR QUE EXISTE: o índice (acima) só diz ONDE cada anexo está —
                até 05/09/2026 não havia como trazer o arquivo de volta.
                Busca simples por categoria/nome/URL de origem, com um botão
                de baixar por linha (só quando realmente foi arquivado).
              */}
              <div className="mt-6 pt-6 border-t">
                <div className="text-sm font-medium mb-2">Recuperar um anexo específico</div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={buscaAnexo}
                    onChange={(e) => setBuscaAnexo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleBuscarAnexos(); }}
                    placeholder="Nome do cliente, categoria (ex.: clientes) ou parte da URL..."
                    className="sm:max-w-sm"
                  />
                  <Button
                    onClick={handleBuscarAnexos}
                    disabled={buscandoAnexo}
                    variant="outline"
                    size="sm"
                  >
                    <Search className="w-4 h-4 mr-2 shrink-0" />
                    {buscandoAnexo ? 'Buscando…' : 'Buscar'}
                  </Button>
                </div>

                {anexosEncontrados && anexosEncontrados.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-600 border-b">
                          <th className="py-2 pr-4">Categoria</th>
                          <th className="py-2 pr-4">Arquivo</th>
                          <th className="py-2 pr-4">Situação</th>
                          <th className="py-2 pr-4">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {anexosEncontrados.map((a) => (
                          <tr key={a.id} className="border-b last:border-0">
                            <td className="py-2 pr-4">{a.categoria}</td>
                            <td className="py-2 pr-4 break-all">{a.arquivo}</td>
                            <td className="py-2 pr-4">
                              {a.situacao === 'archived' ? (
                                <span className="inline-flex items-center gap-1 text-green-700">
                                  <CheckCircle2 className="w-4 h-4 shrink-0" /> Arquivado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-600" title={a.erro ?? undefined}>
                                  <XCircle className="w-4 h-4 shrink-0" /> Falhou{a.erro ? `: ${a.erro}` : ''}
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-4">
                              {a.situacao === 'archived' && (
                                <Button onClick={() => handleBaixarAnexo(a.id)} variant="outline" size="sm">
                                  <Download className="w-4 h-4 mr-2 shrink-0" />
                                  Baixar
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/*
          Conferência do conteúdo.

          Um backup que ninguém nunca abriu é uma hipótese. Este card abre o
          arquivo e compara com o banco — é o que transforma "acho que está
          tudo lá" em um número conferido.
        */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  Conferência do backup
                </CardTitle>
                <CardDescription>
                  Abre o último backup e compara com o banco atual. Não restaura nem altera nada.
                </CardDescription>
              </div>
              <Button
                onClick={() => verifyMutation.mutate({})}
                disabled={verifyMutation.isPending}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto shrink-0"
              >
                {verifyMutation.isPending ? (
                  <>
                    <Clock className="w-4 h-4 mr-2 animate-spin shrink-0" />
                    Conferindo…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2 shrink-0" />
                    Conferir agora
                  </>
                )}
              </Button>
            </div>
          </CardHeader>

          {relatorio && (
            <CardContent>
              <div
                className={`rounded-lg border p-4 mb-4 ${
                  relatorio.integro ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  {relatorio.integro ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className={`font-medium mb-1 ${relatorio.integro ? 'text-green-900' : 'text-red-900'}`}>
                      {relatorio.integro
                        ? 'Todas as tabelas do banco estão no backup.'
                        : `${relatorio.problemas.length} tabela(s) com problema.`}
                    </div>
                    <div className={`text-sm ${relatorio.integro ? 'text-green-800' : 'text-red-800'}`}>
                      {relatorio.tabelasNoBackup} tabelas e{' '}
                      {relatorio.registrosNoBackup.toLocaleString('pt-BR')} registros no backup;{' '}
                      {relatorio.tabelasNoBanco} tabelas e{' '}
                      {relatorio.registrosNoBanco.toLocaleString('pt-BR')} no banco agora.
                    </div>
                    {/* O backup é uma foto de um instante — dizer isso evita que
                        uma diferença normal seja lida como perda de dado. */}
                    {relatorio.integro && relatorio.registrosNoBanco > relatorio.registrosNoBackup && (
                      <div className="text-xs text-green-700 mt-1">
                        A diferença são registros criados depois do backup.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {relatorio.problemas.length > 0 && (
                <div className="mb-4 space-y-1">
                  {relatorio.problemas.map((p) => (
                    <div key={p.tabela} className="text-sm text-red-700 break-all">
                      <strong>{p.tabela}</strong>:{' '}
                      {p.ausente
                        ? 'não existe no backup'
                        : `${p.noBanco.toLocaleString('pt-BR')} registros no banco, nenhum no backup`}
                    </div>
                  ))}
                </div>
              )}

              <details>
                <summary className="text-sm text-gray-600 cursor-pointer">
                  Ver todas as {relatorio.detalhes.length} tabelas
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="text-sm w-full min-w-[320px]">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-1 pr-4 font-medium">Tabela</th>
                        <th className="py-1 pr-4 font-medium text-right">No banco</th>
                        <th className="py-1 font-medium text-right">No backup</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatorio.detalhes.map((d) => (
                        <tr key={d.tabela} className={d.ausente || d.vaziaNoBackup ? 'text-red-700' : ''}>
                          <td className="py-1 pr-4 break-all">
                            {d.tabela}
                            {d.ehView && <span className="ml-1 text-xs text-gray-500">(view)</span>}
                          </td>
                          <td className="py-1 pr-4 text-right tabular-nums">
                            {d.noBanco.toLocaleString('pt-BR')}
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {/* View guarda a consulta, não os dados: contar linhas dela
                                aqui faria um backup correto parecer incompleto. */}
                            {d.ausente ? '—' : d.ehView ? 'consulta' : d.noBackup.toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </CardContent>
          )}
        </Card>

        {/*
          Recuperação seletiva de um backup antigo.

          Diferente do "Restaurar" de cada item do histórico (que SUBSTITUI o
          banco inteiro pelo estado congelado daquele arquivo): aqui o admin
          sobe um arquivo qualquer (ex.: o backup de agosto) e o sistema
          insere só os registros que existem lá e ainda não existem hoje.
          Nada é sobrescrito nem apagado — dado atual sempre vence.
        */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 shrink-0" />
              Recuperar registros de um backup antigo
            </CardTitle>
            <CardDescription>
              Envie um arquivo de backup (.zip ou .sql) para recuperar registros que existem nele e não existem
              mais hoje. Nunca sobrescreve nem apaga nada do banco atual.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                type="file"
                accept=".zip,.sql"
                onChange={(e) => handleMergeFileChange(e.target.files?.[0] ?? null)}
                className="text-sm border rounded-md px-3 py-2 w-full sm:w-auto"
              />
              <Button
                onClick={handleMergeDryRun}
                disabled={!mergeFile || mergeDryRunLoading}
                variant="outline"
                className="w-full sm:w-auto shrink-0"
              >
                {mergeDryRunLoading ? (
                  <>
                    <Clock className="w-4 h-4 mr-2 animate-spin shrink-0" />
                    Analisando…
                  </>
                ) : (
                  'Analisar (não altera nada)'
                )}
              </Button>
            </div>

            {mergeDryRun && (
              <div className="space-y-3">
                <div
                  className={`rounded-lg border p-4 ${
                    mergeDryRun.totalRowsToInsert > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="font-medium text-sm mb-1">
                    {mergeDryRun.totalRowsToInsert > 0
                      ? `${mergeDryRun.totalRowsToInsert} registro(s) seriam inseridos.`
                      : 'Nenhum registro novo para inserir — tudo do backup já existe hoje.'}
                  </div>
                  {mergeDryRun.tablesInBackupNotRecognized.length > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      Tabelas do arquivo ignoradas (fora do escopo desta recuperação):{' '}
                      {mergeDryRun.tablesInBackupNotRecognized.join(', ')}
                    </div>
                  )}
                </div>

                {/*
                  Sem filtro: toda tabela em escopo aparece, mesmo com 0 em
                  todas as colunas ou com erro na análise. Esconder linhas
                  "sem novidade" foi justamente o que tornou o resultado
                  anterior confuso — "não apareceu" virava "não sei o que
                  aconteceu".
                */}
                <div className="overflow-x-auto">
                  <table className="text-sm w-full min-w-[680px]">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-1 pr-4 font-medium">Tabela</th>
                        <th className="py-1 pr-4 font-medium text-right">No backup</th>
                        <th className="py-1 pr-4 font-medium text-right">Em produção hoje</th>
                        <th className="py-1 pr-4 font-medium text-right">Já existem</th>
                        <th className="py-1 pr-4 font-medium text-right">Sem chave</th>
                        <th className="py-1 font-medium text-right">Seriam inseridos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mergeDryRun.tables.map(t => (
                        <tr key={t.table} className={t.error ? 'text-red-700' : t.rowsToInsert > 0 ? 'text-blue-700' : ''}>
                          <td className="py-1 pr-4 break-all">
                            {t.label}
                            {!t.hasNaturalKey && (
                              <span className="ml-1 text-xs text-gray-500" title="Sem chave de identificação segura — nunca inserido automaticamente">
                                (só contagem)
                              </span>
                            )}
                            {t.error && (
                              <div className="text-xs text-red-600 mt-0.5 break-words">Erro ao analisar: {t.error}</div>
                            )}
                          </td>
                          <td className="py-1 pr-4 text-right tabular-nums">{t.rowsInBackup.toLocaleString('pt-BR')}</td>
                          <td className="py-1 pr-4 text-right tabular-nums">{t.rowsCurrentlyInProduction.toLocaleString('pt-BR')}</td>
                          <td className="py-1 pr-4 text-right tabular-nums">
                            {t.hasNaturalKey ? t.rowsAlreadyExisting.toLocaleString('pt-BR') : '—'}
                          </td>
                          <td className="py-1 pr-4 text-right tabular-nums">
                            {t.hasNaturalKey && t.rowsWithoutKeyValue > 0 ? t.rowsWithoutKeyValue.toLocaleString('pt-BR') : '—'}
                          </td>
                          <td className="py-1 text-right tabular-nums font-medium">
                            {t.hasNaturalKey ? t.rowsToInsert.toLocaleString('pt-BR') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Button
                  onClick={handleMergeApply}
                  disabled={mergeApplyLoading || mergeDryRun.totalRowsToInsert === 0}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                >
                  {mergeApplyLoading ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin shrink-0" />
                      Aplicando…
                    </>
                  ) : (
                    `Aplicar (inserir ${mergeDryRun.totalRowsToInsert} registro(s))`
                  )}
                </Button>
              </div>
            )}

            {/*
              Resultado do Aplicar, tabela por tabela, sem filtro.
              `success` não é "o INSERT não lançou erro" — é "reli o banco
              logo depois e as linhas estão realmente lá" (ver rowsVerified
              no backend). É essa diferença que corrige o caso de 31/08/2026:
              uma tabela podia "dizer" que inseriu sem ter persistido de
              verdade, e a tela não deixava isso rastreável.
            */}
            {mergeApplyResult && (
              <div className="space-y-3">
                <div
                  className={`rounded-lg border p-4 ${
                    mergeApplyResult.allSucceeded ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className={`font-medium text-sm mb-1 flex items-center gap-2 ${mergeApplyResult.allSucceeded ? 'text-green-900' : 'text-red-900'}`}>
                    {mergeApplyResult.allSucceeded ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    )}
                    {mergeApplyResult.allSucceeded
                      ? `${mergeApplyResult.totalRowsInserted} registro(s) inserido(s) e confirmado(s) no banco.`
                      : `Concluído com problema: ${mergeApplyResult.totalRowsInserted} inserido(s), mas pelo menos uma tabela não confirmou. Veja o detalhe abaixo.`}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="text-sm w-full min-w-[560px]">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-1 pr-4 font-medium">Tabela</th>
                        <th className="py-1 pr-4 font-medium text-right">Tentados</th>
                        <th className="py-1 pr-4 font-medium text-right">Inseridos</th>
                        <th className="py-1 pr-4 font-medium text-right">Confirmados no banco</th>
                        <th className="py-1 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mergeApplyResult.tables.map(t => (
                        <tr key={t.table} className={!t.success ? 'text-red-700' : t.rowsInserted > 0 ? 'text-green-700' : ''}>
                          <td className="py-1 pr-4 break-all">
                            {t.label}
                            {t.error && <div className="text-xs text-red-600 mt-0.5 break-words">{t.error}</div>}
                          </td>
                          <td className="py-1 pr-4 text-right tabular-nums">{t.rowsAttempted.toLocaleString('pt-BR')}</td>
                          <td className="py-1 pr-4 text-right tabular-nums">{t.rowsInserted.toLocaleString('pt-BR')}</td>
                          <td className="py-1 pr-4 text-right tabular-nums">{t.rowsVerified.toLocaleString('pt-BR')}</td>
                          <td className="py-1">
                            {t.success ? (
                              t.rowsInserted > 0 ? (
                                <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Confirmado</span>
                              ) : (
                                <span className="text-gray-500">Nada a inserir</span>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-700"><XCircle className="w-3.5 h-3.5" /> Falhou</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/*
              Tabelas sem chave natural: o "Aplicar" de cima nunca toca nelas
              (não tem como saber com segurança se um registro do backup já
              existe hoje). Esta seção deixa isso explícito e oferece uma
              recuperação por id — pula só o que já existe com o MESMO id,
              nunca sobrescreve, mas pode duplicar um evento recadastrado
              manualmente depois do backup. Só aparece depois de um dry-run,
              e só faz sentido usar se essas contagens (fotos de vistoria,
              abastecimento etc.) estiverem muito abaixo do esperado — é
              também o que faz os anexos (fotos/documentos) voltarem a ser
              encontráveis pelo "Arquivar anexos" acima, já que ele procura
              as URLs dentro destas tabelas.
            */}
            {mergeDryRun && (
              <div className="pt-2 border-t space-y-3">
                <div>
                  <div className="font-medium text-sm">Tabelas sem chave de identificação segura</div>
                  <div className="text-xs text-gray-500">
                    O "Aplicar" acima nunca insere aqui sozinho. "Seriam inseridos" conta por id (nunca detecta o
                    mesmo evento recadastrado com outro id) — é só o que o "Recuperar mesmo assim" abaixo faria.
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="text-sm w-full min-w-[560px]">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-1 pr-4 font-medium">Tabela</th>
                        <th className="py-1 pr-4 font-medium text-right">No backup</th>
                        <th className="py-1 pr-4 font-medium text-right">Em produção hoje</th>
                        <th className="py-1 font-medium text-right">Seriam inseridos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mergeDryRun.tables
                        .filter(t => !t.hasNaturalKey)
                        .map(t => (
                          <tr key={t.table} className={(t.rowsInsertableById ?? 0) > 0 ? 'text-blue-700' : ''}>
                            <td className="py-1 pr-4 break-all">{t.label}</td>
                            <td className="py-1 pr-4 text-right tabular-nums">{t.rowsInBackup.toLocaleString('pt-BR')}</td>
                            <td className="py-1 pr-4 text-right tabular-nums">{t.rowsCurrentlyInProduction.toLocaleString('pt-BR')}</td>
                            <td className="py-1 text-right tabular-nums font-medium">
                              {t.rowsInsertableById !== undefined ? t.rowsInsertableById.toLocaleString('pt-BR') : '—'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <Button
                  onClick={handleForceRestore}
                  disabled={forceRestoreLoading}
                  variant="outline"
                  className="w-full sm:w-auto text-red-600 hover:text-red-700 border-red-200"
                >
                  {forceRestoreLoading ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin shrink-0" />
                      Recuperando…
                    </>
                  ) : (
                    'Recuperar tabelas sem chave mesmo assim (risco de duplicata)'
                  )}
                </Button>

                {forceRestoreResult && (
                  <div className="space-y-3">
                    <div
                      className={`rounded-lg border p-4 ${
                        forceRestoreResult.allSucceeded ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className={`font-medium text-sm flex items-center gap-2 ${forceRestoreResult.allSucceeded ? 'text-green-900' : 'text-red-900'}`}>
                        {forceRestoreResult.allSucceeded ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                        )}
                        {forceRestoreResult.allSucceeded
                          ? `${forceRestoreResult.totalRowsInserted} registro(s) inserido(s) e confirmado(s) no banco.`
                          : `Concluído com problema: ${forceRestoreResult.totalRowsInserted} inserido(s), mas pelo menos uma tabela não confirmou.`}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="text-sm w-full min-w-[640px]">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="py-1 pr-4 font-medium">Tabela</th>
                            <th className="py-1 pr-4 font-medium text-right">No backup</th>
                            <th className="py-1 pr-4 font-medium text-right">Já tinham o id</th>
                            <th className="py-1 pr-4 font-medium text-right">Inseridos</th>
                            <th className="py-1 pr-4 font-medium text-right">Confirmados</th>
                            <th className="py-1 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {forceRestoreResult.tables.map(t => (
                            <tr key={t.table} className={!t.success ? 'text-red-700' : t.rowsInserted > 0 ? 'text-green-700' : ''}>
                              <td className="py-1 pr-4 break-all">
                                {t.label}
                                {t.error && <div className="text-xs text-red-600 mt-0.5 break-words">{t.error}</div>}
                              </td>
                              <td className="py-1 pr-4 text-right tabular-nums">{t.rowsInBackup.toLocaleString('pt-BR')}</td>
                              <td className="py-1 pr-4 text-right tabular-nums">{t.rowsSkippedExistingId.toLocaleString('pt-BR')}</td>
                              <td className="py-1 pr-4 text-right tabular-nums">{t.rowsInserted.toLocaleString('pt-BR')}</td>
                              <td className="py-1 pr-4 text-right tabular-nums">{t.rowsVerified.toLocaleString('pt-BR')}</td>
                              <td className="py-1">
                                {t.success ? (
                                  t.rowsInserted > 0 ? (
                                    <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Confirmado</span>
                                  ) : (
                                    <span className="text-gray-500">Nada a inserir</span>
                                  )
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-red-700"><XCircle className="w-3.5 h-3.5" /> Falhou</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

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
                    <div className="font-medium text-sm break-all">
                      {nomeDoDownload(stats.lastBackup.fileName)}
                    </div>
                    {stats.lastBackup.fileSizeBytes && (
                      <div className="text-xs text-gray-500">{formatBytes(stats.lastBackup.fileSizeBytes)}</div>
                    )}
                    <div className="text-xs text-gray-500">
                      Guardado criptografado; o download sai como .zip comum.
                    </div>
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
                              <span className="font-medium break-all">{nomeDoDownload(backup.fileName)}</span>
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
