import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, DollarSign, Plus, Pencil, X, RefreshCw, TrendingUp, TrendingDown, AlertCircle, CheckCircle, MessageCircle, Trash2, Webhook, History, Play, Eye, XCircle, Clock, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { formatCurrency } from "@/lib/formatCurrency";

// Componente para classificar uma cobrança individual (com suporte a split e auto-classificação)
function UnclassifiedChargeCard({
  charge,
  clients,
  onClassified,
  onIgnored,
}: {
  charge: {
    asaasChargeId: string;
    description: string;
    value: number;
    dueDate: string;
    status: string;
    clientId: number;
    clientName: string;
    clientEmail: string;
    asaasCustomerId: string;
    allocatedAmount?: number;  // quanto já foi alocado via split
    freeBalance?: number;      // saldo livre para alocar
    allocations?: Array<{ subscriptionChargeId: number; amount: number }>; // histórico
  };
  clients: Array<{ id: number; name: string; email: string }> | undefined;
  onClassified: () => void;
  onIgnored: () => void;
}) {
  const pixValue = typeof charge.value === 'string' ? parseFloat(charge.value) : charge.value;
  // Saldo livre real (considerando alocações já feitas)
  const effectiveFreeBalance = charge.freeBalance !== undefined ? charge.freeBalance : pixValue;

  // Estado local do card
  const [clientId, setClientId] = useState<number>(charge.clientId || 0);
  const [type, setType] = useState<"monthly" | "quota_sale" | "fuel" | "repair" | "other" | "">("" as any);
  const [linkMode, setLinkMode] = useState<"none" | "single" | "split">("none");
  const [selectedLinkCharge, setSelectedLinkCharge] = useState<number | null>(null);

  // Split: lista de { chargeId, amount }
  const [splitItems, setSplitItems] = useState<Array<{ chargeId: number; amount: number }>>([]);
  // Textos dos inputs de split (para aceitar vírgula como separador decimal no mobile)
  const [splitAmountTexts, setSplitAmountTexts] = useState<Record<number, string>>({});

  const utils = trpc.useUtils();

  // Auto-sugestões
  const { data: suggestions } = trpc.saas.autoClassifySuggestions.useQuery(
    { asaasChargeId: charge.asaasChargeId, description: charge.description, value: pixValue, clientId: clientId || undefined, dueDate: charge.dueDate },
    { enabled: true }
  );

  // Aplicar sugestão automática ao montar (se confiança alta e cliente identificado)
  const [suggestionApplied, setSuggestionApplied] = useState(false);
  useState(() => {
    if (!suggestionApplied && suggestions?.suggestedType && !type) {
      setType(suggestions.suggestedType);
      setSuggestionApplied(true);
    }
  });

  // Cobranças pendentes do cliente
  const { data: pendingCharges } = trpc.saas.getClientPendingCharges.useQuery(
    { clientId: clientId! },
    { enabled: clientId > 0 }
  );

  const classifyMutation = trpc.saas.classifyCharge.useMutation({
    onSuccess: (data) => { toast.success(data.message || "Cobrança classificada!"); onClassified(); },
    onError: (e) => toast.error(e.message),
  });

  const splitMutation = trpc.saas.splitPayment.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "Split aplicado com sucesso!");
      if (data.pixFullyAllocated) {
        // Pix totalmente alocado: remover da fila
        onClassified();
      } else {
        // Ainda há saldo livre: recarregar a lista para mostrar o saldo atualizado
        onIgnored(); // reutilizamos onIgnored para invalidar a query sem remover o card
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const ignoreMutation = trpc.saas.ignoreUnclassifiedCharge.useMutation({
    onSuccess: () => { onIgnored(); },
    onError: (e) => toast.error(e.message),
  });

  const handleClientChange = (val: string) => {
    setClientId(parseInt(val));
    setSelectedLinkCharge(null);
    setSplitItems([]);
  };

  const handleClassify = () => {
    if (!clientId || !type) { toast.error("Selecione cliente e tipo"); return; }
    if (linkMode === "single" && !selectedLinkCharge) { toast.error("Selecione a cobrança para vincular"); return; }
    classifyMutation.mutate({
      asaasChargeId: charge.asaasChargeId,
      clientId,
      type: type as any,
      value: pixValue,
      dueDate: charge.dueDate,
      status: charge.status,
      linkToChargeId: linkMode === "single" ? selectedLinkCharge! : undefined,
    });
  };

  const handleSplit = () => {
    if (splitItems.length === 0) { toast.error("Adicione ao menos uma cobrança ao split"); return; }
    const total = splitItems.reduce((s, i) => s + i.amount, 0);
    if (total > effectiveFreeBalance + 0.01) { toast.error(`Soma (${formatCurrency(total)}) excede o saldo livre (${formatCurrency(effectiveFreeBalance)})`); return; }
    splitMutation.mutate({ asaasChargeId: charge.asaasChargeId, pixValue, splits: splitItems });
  };

  const addSplitItem = (chargeId: number) => {
    if (splitItems.find(s => s.chargeId === chargeId)) return;
    const pc = pendingCharges?.find(p => p.id === chargeId);
    if (!pc) return;
    const chargeVal = typeof pc.value === 'string' ? parseFloat(pc.value) : pc.value;
    const alreadyPaid = typeof pc.amountPaid === 'string' ? parseFloat(pc.amountPaid || '0') : (pc.amountPaid || 0);
    const remaining = chargeVal - alreadyPaid;
    const allocated = splitItems.reduce((s, i) => s + i.amount, 0);
    // Usar saldo livre real (já descontando alocações anteriores)
    const available = effectiveFreeBalance - allocated;
    const amount = Math.min(remaining, available);
    setSplitItems(prev => [...prev, { chargeId, amount }]);
  };

  const updateSplitAmount = (chargeId: number, rawText: string) => {
    // Aceitar vírgula e ponto como separador decimal
    const normalized = rawText.replace(',', '.');
    const amount = parseFloat(normalized) || 0;
    setSplitAmountTexts(prev => ({ ...prev, [chargeId]: rawText }));
    setSplitItems(prev => prev.map(s => s.chargeId === chargeId ? { ...s, amount } : s));
  };

  const removeSplitItem = (chargeId: number) => {
    setSplitItems(prev => prev.filter(s => s.chargeId !== chargeId));
    setSplitAmountTexts(prev => { const n = { ...prev }; delete n[chargeId]; return n; });
  };

  const totalAllocated = splitItems.reduce((s, i) => s + i.amount, 0);
  // Saldo livre = saldo real disponível - o que está sendo alocado agora
  const unallocated = effectiveFreeBalance - totalAllocated;

  // Aplicar sugestão de tipo quando suggestions carregam
  if (suggestions?.suggestedType && !type && !suggestionApplied) {
    setType(suggestions.suggestedType);
    setSuggestionApplied(true);
  }

  return (
    <div className="p-4 bg-white border rounded-lg space-y-3">
      {/* Cabeçalho */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{charge.clientName || charge.asaasCustomerId}</h3>
            <p className="text-sm text-muted-foreground">{charge.clientEmail}</p>
          </div>
          {suggestions?.autoClassify && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 whitespace-nowrap">
              ✓ Auto-sugerido
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-4 mt-2 text-sm">
          <span><strong>Descrição:</strong> {charge.description || "Sem descrição"}</span>
          <span><strong>Valor:</strong> {formatCurrency(pixValue)}</span>
          <span><strong>Vencimento:</strong> {new Date(charge.dueDate).toLocaleDateString('pt-BR')}</span>
          <span><strong>Status:</strong> {charge.status}</span>
        </div>
        {/* Histórico de alocações parciais */}
        {charge.allocatedAmount !== undefined && charge.allocatedAmount > 0 && (
          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-amber-800">Pix com alocações parciais</span>
              <span className="text-amber-700">Saldo livre: <strong>{formatCurrency(effectiveFreeBalance)}</strong></span>
            </div>
            <div className="text-amber-700">
              Já alocado: {formatCurrency(charge.allocatedAmount)} de {formatCurrency(pixValue)}
            </div>
            {charge.allocations && charge.allocations.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {charge.allocations.map((alloc, idx) => (
                  <div key={idx} className="text-amber-600">
                    • Cobrança #{alloc.subscriptionChargeId}: {formatCurrency(alloc.amount)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Sugestão de tipo */}
        {suggestions?.suggestedType && (
          <div className="mt-2 text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 inline-block">
            💡 Tipo sugerido: <strong>{suggestions.suggestedType === 'fuel' ? 'Abastecimento' : suggestions.suggestedType === 'repair' ? 'Reparos' : suggestions.suggestedType === 'quota_sale' ? 'Venda de Cota' : suggestions.suggestedType === 'monthly' ? 'Mensalidade' : 'Outros'}</strong> ({suggestions.typeConfidence}% confiança)
          </div>
        )}
      </div>

      {/* Campos de classificação */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>Cliente</Label>
          <Select value={clientId?.toString() || ""} onValueChange={handleClientChange}>
            <SelectTrigger><SelectValue placeholder="Selecione cliente" /></SelectTrigger>
            <SelectContent>
              {clients?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tipo</Label>
          <Select value={type} onValueChange={(v: any) => setType(v)}>
            <SelectTrigger><SelectValue placeholder="Selecione tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Mensalidade</SelectItem>
              <SelectItem value="quota_sale">Venda de Cota</SelectItem>
              <SelectItem value="fuel">Abastecimento</SelectItem>
              <SelectItem value="repair">Reparos</SelectItem>
              <SelectItem value="other">Outros</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          {linkMode !== "split" && (
            <Button onClick={handleClassify} disabled={classifyMutation.isPending} className="flex-1">
              Classificar
            </Button>
          )}
          {linkMode === "split" && (
            <Button onClick={handleSplit} disabled={splitMutation.isPending || ignoreMutation.isPending} className="flex-1 bg-orange-600 hover:bg-orange-700">
              Aplicar Split
            </Button>
          )}
          <Button variant="outline" onClick={() => ignoreMutation.mutate({ unclassifiedChargeId: charge.asaasChargeId })} disabled={ignoreMutation.isPending}>
            Ignorar
          </Button>
        </div>
      </div>

      {/* Opções de vinculação */}
      {clientId > 0 && (
        <div className="border-t pt-3 space-y-2">
          {/* Toggle: Vincular a 1 cobrança */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`link-${charge.asaasChargeId}`}
              checked={linkMode === "single"}
              onChange={() => setLinkMode(linkMode === "single" ? "none" : "single")}
              className="h-4 w-4 cursor-pointer"
            />
            <label htmlFor={`link-${charge.asaasChargeId}`} className="text-sm font-medium cursor-pointer text-amber-700">
              Vincular a cobrança existente (evitar duplicidade)
            </label>
          </div>

          {/* Toggle: Split — 1 Pix para múltiplas cobranças */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`split-${charge.asaasChargeId}`}
              checked={linkMode === "split"}
              onChange={() => { setLinkMode(linkMode === "split" ? "none" : "split"); setSplitItems([]); }}
              className="h-4 w-4 cursor-pointer"
            />
            <label htmlFor={`split-${charge.asaasChargeId}`} className="text-sm font-medium cursor-pointer text-orange-700">
              Split — distribuir este Pix entre múltiplas cobranças
            </label>
          </div>

          {/* Modo: vincular a 1 cobrança */}
          {linkMode === "single" && (
            <div className="ml-6">
              <Label className="text-xs text-muted-foreground">Cobrança pendente para quitar</Label>
              <Select
                value={selectedLinkCharge?.toString() || ""}
                onValueChange={(v) => setSelectedLinkCharge(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={pendingCharges ? (pendingCharges.length === 0 ? "Nenhuma cobrança pendente" : "Selecione a cobrança") : "Carregando..."} />
                </SelectTrigger>
                <SelectContent>
                  {pendingCharges?.map((pc) => {
                    const totalVal = typeof pc.value === 'string' ? parseFloat(pc.value) : pc.value;
                    const paid = typeof pc.amountPaid === 'string' ? parseFloat(pc.amountPaid || '0') : (pc.amountPaid || 0);
                    const remaining = totalVal - paid;
                    return (
                      <SelectItem key={pc.id} value={pc.id.toString()}>
                        {formatCurrency(totalVal)} — Venc: {new Date(pc.dueDate).toLocaleDateString('pt-BR')} — {
                          pc.status === 'partial' ? `🟡 Parcial (Saldo: ${formatCurrency(remaining)})` :
                          pc.status === 'overdue' ? '⚠️ Vencida' : '⏳ Pendente'
                        }
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">O valor do Pix será somado ao já recebido. A cobrança só será quitada quando o total atingir o valor da fatura.</p>
            </div>
          )}

          {/* Modo: split entre múltiplas cobranças */}
          {linkMode === "split" && (
            <div className="ml-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-orange-700">Distribuir {formatCurrency(effectiveFreeBalance)}</p>
                  {charge.allocatedAmount !== undefined && charge.allocatedAmount > 0 && (
                    <p className="text-xs text-amber-600">Total do Pix: {formatCurrency(pixValue)} | Já alocado: {formatCurrency(charge.allocatedAmount)}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${Math.abs(unallocated) < 0.02 ? 'bg-green-100 text-green-700' : unallocated < 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                  {unallocated >= 0 ? `Saldo livre: ${formatCurrency(unallocated)}` : `Excesso: ${formatCurrency(-unallocated)}`}
                </span>
              </div>

              {/* Cobranças já adicionadas ao split */}
              {splitItems.map((item) => {
                const pc = pendingCharges?.find(p => p.id === item.chargeId);
                if (!pc) return null;
                const totalVal = typeof pc.value === 'string' ? parseFloat(pc.value) : pc.value;
                return (
                  <div key={item.chargeId} className="flex items-center gap-2 p-2 bg-orange-50 rounded border border-orange-200">
                    <div className="flex-1 text-sm">
                      <span className="font-medium">{formatCurrency(totalVal)}</span>
                      <span className="text-muted-foreground"> — Venc: {new Date(pc.dueDate).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Alocar:</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={splitAmountTexts[item.chargeId] ?? item.amount.toFixed(2).replace('.', ',')}
                        onChange={(e) => updateSplitAmount(item.chargeId, e.target.value)}
                        className="w-24 h-7 text-sm"
                      />
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeSplitItem(item.chargeId)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}

              {/* Adicionar cobrança ao split */}
              <div>
                <Label className="text-xs text-muted-foreground">Adicionar cobrança ao split</Label>
                <Select onValueChange={(v) => addSplitItem(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione cobrança pendente" />
                  </SelectTrigger>
                  <SelectContent>
                    {pendingCharges?.filter(pc => !splitItems.find(s => s.chargeId === pc.id)).map((pc) => {
                      const totalVal = typeof pc.value === 'string' ? parseFloat(pc.value) : pc.value;
                      const paid = typeof pc.amountPaid === 'string' ? parseFloat(pc.amountPaid || '0') : (pc.amountPaid || 0);
                      const remaining = totalVal - paid;
                      // Verificar se esta cobrança já recebeu alocação deste Pix
                      const alreadyAllocatedInThisPix = charge.allocations?.some(a => a.subscriptionChargeId === pc.id);
                      return (
                        <SelectItem
                          key={pc.id}
                          value={pc.id.toString()}
                          disabled={alreadyAllocatedInThisPix}
                        >
                          {alreadyAllocatedInThisPix ? '✓ Já alocada: ' : ''}{formatCurrency(totalVal)} — Venc: {new Date(pc.dueDate).toLocaleDateString('pt-BR')} — {
                            alreadyAllocatedInThisPix ? `Recebeu ${formatCurrency(charge.allocations?.find(a => a.subscriptionChargeId === pc.id)?.amount ?? 0)}` :
                            pc.status === 'partial' ? `🟡 Saldo: ${formatCurrency(remaining)}` :
                            pc.status === 'overdue' ? '⚠️ Vencida' : '⏳ Pendente'
                          }
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Cada cobrança receberá o valor alocado. Saldo livre disponível: {formatCurrency(effectiveFreeBalance)}.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Componente para listar e classificar cobranças não classificadas
function UnclassifiedChargesSection() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data: unclassifiedData, isLoading, error, refetch } = trpc.saas.listUnclassifiedCharges.useQuery(
    { page, pageSize: 50, search: debouncedSearch || undefined },
    { staleTime: 60 * 1000, retry: 1 }
  );
  const { data: clients } = trpc.allowedClients.list.useQuery();

  // Sincronizar cache BPO com o Asaas
  const syncCacheMutation = trpc.saas.syncBpoCache.useMutation({
    onSuccess: (data) => {
      toast.success(
        `🔄 Cache sincronizado: ${data.inserted + data.updated} cobranças processadas, ${data.unclassifiedCount} aguardando classificação`,
        { duration: 8000 }
      );
      setPage(1);
      utils.saas.listUnclassifiedCharges.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao sincronizar cache: ${error.message}`);
    },
  });

  const autoClassifyMutation = trpc.saas.autoClassifyAll.useMutation({
    onSuccess: (data) => {
      if (data.classifiedCount > 0) {
        toast.success(
          `⚡ ${data.classifiedCount} cobrança(s) classificada(s) automaticamente!`,
          { duration: 6000 }
        );
      } else {
        toast.info(
          `Nenhuma cobrança atingiu o threshold de 85% de confiança`,
          { duration: 5000 }
        );
      }
      utils.saas.listUnclassifiedCharges.invalidate();
      utils.saas.listCharges.invalidate();
      utils.saas.getFilteredStats.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro na classificação automática: ${error.message}`);
    },
  });

  const handleClassified = () => {
    utils.saas.listUnclassifiedCharges.invalidate();
    utils.saas.listCharges.invalidate();
    utils.saas.getFilteredStats.invalidate();
  };

  const handleIgnored = () => {
    utils.saas.listUnclassifiedCharges.invalidate();
  };

  // Cache vazio: mostrar banner para sincronizar
  if (!isLoading && unclassifiedData?.cacheEmpty) {
    return (
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="py-8">
          <div className="text-center">
            <AlertCircle className="h-10 w-10 text-blue-500 mx-auto mb-3" />
            <p className="text-blue-800 font-semibold mb-1">Cache BPO vazio</p>
            <p className="text-blue-600 text-sm mb-4">Sincronize o cache para carregar as cobranças do Asaas.</p>
            <Button
              onClick={() => syncCacheMutation.mutate()}
              disabled={syncCacheMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncCacheMutation.isPending ? 'animate-spin' : ''}`} />
              {syncCacheMutation.isPending ? 'Sincronizando...' : 'Sincronizar Cache Agora'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) return (
    <Card className="border-yellow-200 bg-yellow-50">
      <CardContent className="py-8 text-center text-yellow-700">
        Carregando cobranças do cache local...
      </CardContent>
    </Card>
  );
  if (error) return (
    <Card className="border-red-200 bg-red-50">
      <CardContent className="py-8 text-center text-red-700">
        Erro ao carregar cobranças: {error.message}
      </CardContent>
    </Card>
  );
  if (!unclassifiedData || unclassifiedData.totalCount === 0) return null;

  const { charges, totalCount, totalPages, lastSyncedAt } = unclassifiedData;

  return (
    <Card className="border-yellow-200 bg-yellow-50">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              Cobranças Não Classificadas
            </CardTitle>
            <CardDescription className="mt-1">
              {totalCount} cobrança(s) aguardando classificação
              {lastSyncedAt && (
                <span className="ml-2 text-xs text-yellow-600">
                  • Última sync: {new Date(lastSyncedAt).toLocaleString('pt-BR')}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncCacheMutation.mutate()}
              disabled={syncCacheMutation.isPending || autoClassifyMutation.isPending}
              className="bg-white border-blue-300 text-blue-700 hover:bg-blue-50 whitespace-nowrap"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncCacheMutation.isPending ? 'animate-spin' : ''}`} />
              {syncCacheMutation.isPending ? 'Sincronizando...' : '🔄 Sincronizar Cache'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => autoClassifyMutation.mutate({ confidenceThreshold: 85 })}
              disabled={autoClassifyMutation.isPending || syncCacheMutation.isPending}
              className="bg-white border-yellow-400 text-yellow-700 hover:bg-yellow-50 hover:text-yellow-800 whitespace-nowrap"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${autoClassifyMutation.isPending ? 'animate-spin' : ''}`} />
              {autoClassifyMutation.isPending ? 'Classificando...' : '⚡ Classificar Automaticamente (≥85%)'}
            </Button>
          </div>
        </div>
        {/* Barra de busca */}
        <div className="mt-3">
          <input
            type="text"
            placeholder="Buscar por cliente, email ou descrição..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 text-sm border border-yellow-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {charges.map((charge) => (
            <UnclassifiedChargeCard
              key={charge.asaasChargeId}
              charge={charge as any}
              clients={clients}
              onClassified={handleClassified}
              onIgnored={handleIgnored}
            />
          ))}
        </div>

        {/* Paginação */}
        {totalPages && totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-yellow-200">
            <p className="text-sm text-yellow-700">
              Página {page} de {totalPages} • {totalCount} cobranças no total
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="bg-white border-yellow-300"
              >
                ← Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="bg-white border-yellow-300"
              >
                Próxima →
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Saas() {
  const [, setLocation] = useLocation();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showEditChargeDialog, setShowEditChargeDialog] = useState(false);
  const [editingChargeId, setEditingChargeId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "paid" | "overdue" | "cancelled" | "partial" | "all">("all");
  const [typeFilters, setTypeFilters] = useState<Array<"monthly" | "quota_sale" | "fuel" | "repair" | "other">>([]); // Filtro B: seleção múltipla
  // Mantém typeFilter para compatibilidade com código legado
  const typeFilter = typeFilters.length === 1 ? typeFilters[0] : "all";

  const toggleTypeFilter = (type: "monthly" | "quota_sale" | "fuel" | "repair" | "other") => {
    setTypeFilters(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };
  const [boatFilter, setBoatFilter] = useState<string>(""); // Filtro por embarcação
  const [searchQuery, setSearchQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [yearFilter, setYearFilter] = useState<string>("");
  
  const [editChargeForm, setEditChargeForm] = useState({
    value: "",
    dueDate: "",
    type: "monthly" as "monthly" | "quota_sale" | "fuel" | "repair" | "other",
  });

  // Estado para detalhe de cobrança
  const [selectedCharge, setSelectedCharge] = useState<any>(null);
  const [showChargeDetail, setShowChargeDetail] = useState(false);

  // Aba ativa do painel principal
  const [activeTab, setActiveTab] = useState<"charges" | "webhooks" | "reconciliation" | "consolidated">("charges");

  // Filtros da Visão Consolidada
  const [consolidatedStatus, setConsolidatedStatus] = useState("all");
  const [consolidatedType, setConsolidatedType] = useState("all");
  const [consolidatedSource, setConsolidatedSource] = useState("all");
  const [consolidatedSearch, setConsolidatedSearch] = useState("");
  const [consolidatedMonth, setConsolidatedMonth] = useState("");
  const [consolidatedYear, setConsolidatedYear] = useState("");
  
  // Gerar mês atual no formato YYYY-MM
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [form, setForm] = useState({
    clientId: 0,
    type: "monthly" as "monthly" | "quota_sale" | "fuel" | "repair" | "other",
    value: "",
    dueDay: "10",
    startMonth: currentMonth,
    endDate: "",
    yearlyAdjustment: "manual" as "manual" | "ipca" | "igpm",
    installments: 1,
  });

  const utils = trpc.useUtils();
  const { data: charges, isLoading, isError: chargesError } = trpc.saas.listCharges.useQuery({
    status: statusFilter === "all" ? "all" : statusFilter as "pending" | "paid" | "overdue" | "cancelled" | "partial",
    types: typeFilters.length > 0 ? typeFilters : undefined,
    boatId: boatFilter ? parseInt(boatFilter) : undefined,
    month: monthFilter || undefined,
    year: yearFilter || undefined,
    search: searchQuery || undefined,
  });
  const { data: clients } = trpc.allowedClients.list.useQuery();
  const { data: boats } = trpc.vessels.list.useQuery(); // Buscar lista de embarcações
  // Queries para Webhooks e Reconciliação (migradas da página Pagamentos)
  const webhookLogsQuery = trpc.payments.webhookLogs.useQuery(
    { limit: 50 },
    { enabled: activeTab === "webhooks" }
  );
  const reconciliationHistoryQuery = trpc.payments.reconciliationHistory.useQuery(
    { limit: 10 },
    { enabled: activeTab === "reconciliation" }
  );

  // Query da Visão Consolidada
  const financialChargesQuery = trpc.saas.financialCharges.useQuery(
    {
      status: consolidatedStatus as any,
      type: consolidatedType as any,
      source: consolidatedSource as any,
      search: consolidatedSearch || undefined,
      month: consolidatedMonth || undefined,
      year: consolidatedYear || undefined,
    },
    { enabled: activeTab === "consolidated" }
  );

  const { data: dashboard } = trpc.saas.getFilteredStats.useQuery({
    status: statusFilter === "all" ? "all" : statusFilter as "pending" | "paid" | "overdue" | "cancelled" | "partial",
    types: typeFilters.length > 0 ? typeFilters : undefined,
    boatId: boatFilter ? parseInt(boatFilter) : undefined,
    month: monthFilter || undefined,
    year: yearFilter || undefined,
    search: searchQuery || undefined,
  });

  const createMutation = trpc.saas.create.useMutation({
    onSuccess: () => {
      toast.success("Mensalidade criada com sucesso!");
      utils.saas.list.invalidate();
      utils.saas.getFilteredStats.invalidate();
      setShowDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.saas.update.useMutation({
    onSuccess: () => {
      toast.success("Mensalidade atualizada com sucesso!");
      utils.saas.list.invalidate();
      utils.saas.getFilteredStats.invalidate();
      setShowDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const cancelMutation = trpc.saas.cancel.useMutation({
    onSuccess: () => {
      toast.success("Mensalidade cancelada com sucesso!");
      utils.saas.list.invalidate();
      utils.saas.getFilteredStats.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const markAsPaidMutation = trpc.saas.markChargeAsPaid.useMutation({
    onSuccess: () => {
      toast.success("Cobrança marcada como paga com sucesso!");
      utils.saas.list.invalidate();
      utils.saas.getFilteredStats.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateChargeMutation = trpc.saas.updateCharge.useMutation({
    onSuccess: async () => {
      toast.success("Cobrança atualizada com sucesso!");
      // Invalidar TODAS as queries relacionadas
      await utils.saas.list.invalidate();
      await utils.saas.listCharges.invalidate();
      await utils.saas.getFilteredStats.invalidate();
      // Forçar refetch imediato
      await utils.saas.listCharges.refetch();
      setShowEditChargeDialog(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteChargeMutation = trpc.saas.deleteCharge.useMutation({
    onSuccess: () => {
      toast.success("Cobrança excluída com sucesso!");
      utils.saas.list.invalidate();
      utils.saas.getFilteredStats.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const syncMutation = trpc.saas.syncWithAsaas.useMutation({
    onSuccess: (data) => {
      const messages: string[] = [];
      messages.push(`✅ ${data.syncedCount} cobranças sincronizadas`);
      
      if (data.excludedCount && data.excludedCount > 0) {
        messages.push(`ℹ️ ${data.excludedCount} cobranças de abastecimento/vistoria ignoradas (já classificadas em outras abas)`);
      }
      
      if (data.unclassifiedCount && data.unclassifiedCount > 0) {
        messages.push(`⚠️ ${data.unclassifiedCount} cobranças não classificadas`);
        console.log('[Saas] Cobranças não classificadas:', data.unclassifiedCharges);
        toast.warning(messages.join('\n'), { duration: 10000 });
      } else {
        toast.success(messages.join('\n'), { duration: 5000 });
      }
      
      utils.saas.getFilteredStats.invalidate();
      utils.saas.list.invalidate();
      utils.saas.listCharges.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Mutations migradas da página Pagamentos
  const runReconciliationMutation = trpc.payments.runReconciliation.useMutation({
    onSuccess: (data) => {
      toast.success(`Reconciliação concluída: ${data.totalChecked} verificados, ${data.totalFixed} corrigidos`);
      reconciliationHistoryQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Erro na reconciliação: ${error.message}`);
    },
  });

  const runMaintenanceMutation = trpc.payments.runMaintenance.useMutation({
    onSuccess: () => {
      toast.success("Tarefas de manutenção executadas com sucesso");
      reconciliationHistoryQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Erro na manutenção: ${error.message}`);
    },
  });

  const cancelChargeFromDetailMutation = trpc.saas.deleteCharge.useMutation({
    onSuccess: () => {
      toast.success("Cobrança cancelada com sucesso");
      utils.saas.listCharges.invalidate();
      utils.saas.getFilteredStats.invalidate();
      setShowChargeDetail(false);
    },
    onError: (error) => {
      toast.error(`Erro ao cancelar: ${error.message}`);
    },
  });

  const syncBpoCacheMutation = trpc.saas.syncBpoCache.useMutation({
    onSuccess: (data) => {
      toast.success(
        `🔄 Cache BPO sincronizado: ${data.inserted + data.updated} cobranças processadas, ${data.unclassifiedCount} aguardando classificação`,
        { duration: 8000 }
      );
      utils.saas.listUnclassifiedCharges.invalidate();
      utils.saas.getFilteredStats.invalidate();
      utils.saas.listCharges.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao sincronizar cache BPO: ${error.message}`);
    },
  });

  const resetForm = () => {
    setForm({
      clientId: 0,
      type: "monthly",
      value: "",
      dueDay: "10",
      startMonth: new Date().toISOString().slice(0, 7),
      endDate: "",
      yearlyAdjustment: "manual",
      installments: 1,
    });
    setEditingId(null);
  };

  const handleSubmit = () => {
    if (!form.clientId || !form.value || !form.dueDay) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const data = {
      clientId: form.clientId,
      type: form.type,
      value: parseFloat(form.value),
      dueDay: parseInt(form.dueDay),
      startMonth: form.startMonth,
      endDate: form.endDate || undefined,
      yearlyAdjustment: form.yearlyAdjustment,
      installments: form.type === "quota_sale" ? form.installments : undefined,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (subscription: any) => {
    setEditingId(subscription.subscription.id);
    // Derivar startMonth do startDate existente (YYYY-MM-DD -> YYYY-MM)
    const startMonthVal = subscription.subscription.startDate
      ? subscription.subscription.startDate.split('T')[0].slice(0, 7)
      : new Date().toISOString().slice(0, 7);
    setForm({
      clientId: subscription.subscription.clientId,
      type: subscription.subscription.type,
      value: subscription.subscription.value,
      dueDay: subscription.subscription.dueDay.toString(),
      startMonth: startMonthVal,
      endDate: subscription.subscription.endDate ? subscription.subscription.endDate.split('T')[0] : "",
      yearlyAdjustment: subscription.subscription.yearlyAdjustment,
      installments: 1,
    });
    setShowDialog(true);
  };

  const handleCancel = (id: number) => {
    if (confirm("Tem certeza que deseja cancelar esta mensalidade?")) {
      cancelMutation.mutate({ id });
    }
  };

  const handleMarkAsPaid = (subscriptionId: number, chargeId?: number) => {
    if (!confirm("Tem certeza que deseja marcar esta cobrança como paga?")) {
      return;
    }

    markAsPaidMutation.mutate({
      subscriptionId,
      chargeId,
      paymentDate: new Date().toISOString().split('T')[0],
      notifyCustomer: false,
    });
  };

  const handleEditCharge = (chargeId: number) => {
    const charge = charges?.find(c => c.charge.id === chargeId);
    if (!charge) {
      toast.error("Cobrança não encontrada");
      return;
    }

    setEditingChargeId(chargeId);
    setEditChargeForm({
      value: charge.charge.value.toString(),
      dueDate: charge.charge.dueDate,
      type: (charge.charge.type ?? "monthly") as "monthly" | "quota_sale" | "fuel" | "repair" | "other",
    });
    setShowEditChargeDialog(true);
  };

  const handleDeleteCharge = (chargeId: number) => {
    if (!confirm("Tem certeza que deseja excluir esta cobrança? Esta ação é permanente e não pode ser desfeita.")) {
      return;
    }

    deleteChargeMutation.mutate({ chargeId });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setLocation("/admin")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">BPO Financeiro</h1>
            <p className="text-sm text-gray-600">Gestão de pagamentos e recebimentos</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => syncBpoCacheMutation.mutate()}
            disabled={syncBpoCacheMutation.isPending || syncMutation.isPending}
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncBpoCacheMutation.isPending ? 'animate-spin' : ''}`} />
            {syncBpoCacheMutation.isPending ? 'Sincronizando...' : '🔄 Sincronizar Cache BPO'}
          </Button>
          <Button
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || syncBpoCacheMutation.isPending}
            title="Sincronização completa com o Asaas (mais lenta)"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            Sync Completo
          </Button>
          <Button onClick={() => { resetForm(); setShowDialog(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Cobrança
          </Button>
        </div>
      </div>

      {/* Dashboard de Inadimplência */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Esperado</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(dashboard?.totalExpected || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recebido</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(dashboard?.totalPaid || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboard?.paidCount || 0} cobrança(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendente</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {formatCurrency(dashboard?.totalPending || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboard?.pendingCount || 0} cobrança(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vencido</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(dashboard?.totalOverdue || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboard?.overdueCount || 0} cobrança(s)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filtro A: Status (seleção única) */}
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Status</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={statusFilter === "all" ? "default" : "outline"}
                onClick={() => setStatusFilter("all")}
              >
                Todas
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "pending" ? "default" : "outline"}
                onClick={() => setStatusFilter(statusFilter === "pending" ? "all" : "pending")}
              >
                Pendentes
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "paid" ? "default" : "outline"}
                onClick={() => setStatusFilter(statusFilter === "paid" ? "all" : "paid")}
              >
                Pagas
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "overdue" ? "default" : "outline"}
                onClick={() => setStatusFilter(statusFilter === "overdue" ? "all" : "overdue")}
              >
                Vencidas
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "partial" ? "default" : "outline"}
                onClick={() => setStatusFilter(statusFilter === "partial" ? "all" : "partial")}
                className={statusFilter === "partial" ? "" : "border-orange-300 text-orange-700 hover:bg-orange-50"}
              >
                Parciais
              </Button>
            </div>
          </div>

          {/* Filtro B: Tipo (seleção múltipla) */}
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Tipo {typeFilters.length > 0 && <span className="text-primary">({typeFilters.length} selecionado{typeFilters.length > 1 ? 's' : ''})</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {([
                { value: "monthly", label: "Mensalidades" },
                { value: "quota_sale", label: "Vendas de Cotas" },
                { value: "fuel", label: "Abastecimento" },
                { value: "repair", label: "Reparos" },
                { value: "other", label: "Outros" },
              ] as const).map(({ value, label }) => (
                <Button
                  key={value}
                  size="sm"
                  variant={typeFilters.includes(value) ? "default" : "outline"}
                  onClick={() => toggleTypeFilter(value)}
                >
                  {label}
                </Button>
              ))}
              {typeFilters.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTypeFilters([])}
                  className="text-muted-foreground"
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>

          {/* Filtro de Busca, Período e Embarcação */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Busca por Cliente */}
            <div>
              <label className="text-sm font-medium mb-2 block">Buscar Cliente</label>
              <input
                type="text"
                placeholder="Nome ou email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            {/* Filtro por Embarcação */}
            <div>
              <label className="text-sm font-medium mb-2 block">Embarcação</label>
              <select
                value={boatFilter}
                onChange={(e) => setBoatFilter(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Todas as embarcações</option>
                {boats?.map((boat) => (
                  <option key={boat.id} value={boat.id.toString()}>
                    {boat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro por Mês */}
            <div>
              <label className="text-sm font-medium mb-2 block">Mês</label>
              <select
                value={monthFilter}
                onChange={(e) => {
                  console.log('Month changed to:', e.target.value);
                  setMonthFilter(e.target.value);
                }}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Todos os meses</option>
                <option value="01">Janeiro</option>
                <option value="02">Fevereiro</option>
                <option value="03">Março</option>
                <option value="04">Abril</option>
                <option value="05">Maio</option>
                <option value="06">Junho</option>
                <option value="07">Julho</option>
                <option value="08">Agosto</option>
                <option value="09">Setembro</option>
                <option value="10">Outubro</option>
                <option value="11">Novembro</option>
                <option value="12">Dezembro</option>
              </select>
            </div>

            {/* Filtro por Ano */}
            <div>
              <label className="text-sm font-medium mb-2 block">Ano</label>
              <select
                value={yearFilter}
                onChange={(e) => {
                  console.log('Year changed to:', e.target.value);
                  setYearFilter(e.target.value);
                }}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Todos os anos</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
            </div>
          </div>

          {/* Botão Limpar Filtros */}
          {(searchQuery || boatFilter || monthFilter || yearFilter || statusFilter !== "all" || typeFilter !== "all") && (
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setBoatFilter("");
                  setMonthFilter("");
                  setYearFilter("");
                  setStatusFilter("all");
                  setTypeFilters([]);
                }}
              >
                Limpar Filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cobranças Não Classificadas */}
      <UnclassifiedChargesSection />

      {/* Lista de Mensalidades */}
      <Card>
        <CardHeader>
          <CardTitle>Cobranças</CardTitle>
          <CardDescription>
            {charges?.length || 0} cobrança(s) encontrada(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground">Carregando...</p>
          ) : chargesError ? (
            <p className="text-center text-red-500 py-4">Erro ao carregar cobranças. Tente recarregar a página.</p>
          ) : charges && charges.length > 0 ? (
            <div className="space-y-4">
              {charges.map((item) => (
                <div
                  key={item.charge.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between p-4 border rounded-lg gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{item.client?.name || "Cliente não encontrado"}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        item.charge.status === "paid" ? "bg-green-100 text-green-700" :
                        item.charge.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                        item.charge.status === "overdue" ? "bg-red-100 text-red-700" :
                        item.charge.status === "partial" ? "bg-orange-100 text-orange-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {item.charge.status === "paid" ? "Paga" :
                         item.charge.status === "pending" ? "Pendente" :
                         item.charge.status === "overdue" ? "Vencida" :
                         item.charge.status === "partial" ? "Parcial" : "Cancelada"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.client?.email}</p>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm">
                      <span>
                        <strong>Tipo:</strong> {(item.charge.type || item.subscription?.type) === "monthly" ? "Mensalidade" : "Venda de Cota"}
                      </span>
                      <span>
                        <strong>Valor:</strong> {formatCurrency(parseFloat(item.charge.value))}
                      </span>
                      <span>
                        <strong>Vencimento:</strong> {new Date(item.charge.dueDate).toLocaleDateString('pt-BR')}
                      </span>
                      {item.charge.status === "partial" && (() => {
                        const totalVal = parseFloat(item.charge.value);
                        const paidVal = parseFloat((item.charge as any).amountPaid || '0');
                        const remainingVal = totalVal - paidVal;
                        return (
                          <>
                            <span className="text-orange-600">
                              <strong>Recebido:</strong> {formatCurrency(paidVal)}
                            </span>
                            <span className="text-orange-600">
                              <strong>Saldo:</strong> {formatCurrency(remainingVal)}
                            </span>
                          </>
                        );
                      })()}
                      {item.charge.paidDate && (
                        <span>
                          <strong>Pago em:</strong> {new Date(item.charge.paidDate).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      <span>
                        <strong>Reajuste:</strong> {
                          item.subscription?.yearlyAdjustment === "manual" ? "Manual" :
                          item.subscription?.yearlyAdjustment === "ipca" ? "IPCA" : "IGP-M"
                        }
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setSelectedCharge(item); setShowChargeDetail(true); }}
                      title="Ver detalhes"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {item.charge.status !== "paid" && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleMarkAsPaid(item.subscription?.id || 0, item.charge.id)}
                        disabled={item.charge.status === "cancelled"}
                        title="Marcar como recebido"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <a
                      href={`https://wa.me/${item.client?.phone?.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Falar no WhatsApp"
                    >
                      <Button variant="outline" size="icon">
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </a>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEditCharge(item.charge.id)}
                      title="Editar cobrança"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDeleteCharge(item.charge.id)}
                      title="Excluir cobrança"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground">Nenhuma mensalidade cadastrada</p>
          )}
        </CardContent>
      </Card>

      {/* Abas: Webhooks e Reconciliação */}
      <div className="mt-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-4">
            <TabsTrigger value="charges">
              <CreditCard className="h-4 w-4 mr-2" />
              Cobranças
            </TabsTrigger>
            <TabsTrigger value="webhooks">
              <Webhook className="h-4 w-4 mr-2" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="reconciliation">
              <History className="h-4 w-4 mr-2" />
              Reconciliação
            </TabsTrigger>
            <TabsTrigger value="consolidated">
              <TrendingUp className="h-4 w-4 mr-2" />
              Visão Consolidada
            </TabsTrigger>
          </TabsList>

          {/* Aba Cobranças: apenas placeholder (conteúdo já está acima) */}
          <TabsContent value="charges">
            <p className="text-sm text-muted-foreground text-center py-2">Use os filtros e a lista acima para gerenciar cobranças.</p>
          </TabsContent>

          {/* Aba Webhooks */}
          <TabsContent value="webhooks">
            <Card>
              <CardHeader>
                <CardTitle>Logs de Webhook</CardTitle>
                <CardDescription>Histórico de notificações recebidas do Asaas</CardDescription>
              </CardHeader>
              <CardContent>
                {webhookLogsQuery.isLoading ? (
                  <p className="text-center text-muted-foreground py-4">Carregando...</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Evento</TableHead>
                          <TableHead>Processado</TableHead>
                          <TableHead>IP</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Erro</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {webhookLogsQuery.data?.logs?.map((log: any) => (
                          <TableRow key={log.id}>
                            <TableCell className="font-mono text-sm">#{log.id}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{log.eventType}</Badge>
                            </TableCell>
                            <TableCell>
                              {log.processed ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{log.ipAddress}</TableCell>
                            <TableCell className="text-sm">
                              {new Date(log.createdAt).toLocaleString('pt-BR')}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-red-600 text-sm">
                              {log.errorMessage}
                            </TableCell>
                          </TableRow>
                        ))}
                        {(!webhookLogsQuery.data?.logs || webhookLogsQuery.data.logs.length === 0) && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                              Nenhum log de webhook encontrado
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba Reconciliação */}
          <TabsContent value="reconciliation">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle>Reconciliação</CardTitle>
                    <CardDescription>Verifica divergências entre banco local e Asaas</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => runMaintenanceMutation.mutate()}
                      disabled={runMaintenanceMutation.isPending}
                    >
                      {runMaintenanceMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Executar Manutenção
                    </Button>
                    <Button
                      onClick={() => runReconciliationMutation.mutate()}
                      disabled={runReconciliationMutation.isPending}
                    >
                      {runReconciliationMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Reconciliar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {reconciliationHistoryQuery.isLoading ? (
                  <p className="text-center text-muted-foreground py-4">Carregando...</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Verificados</TableHead>
                          <TableHead>Divergentes</TableHead>
                          <TableHead>Corrigidos</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Executado por</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reconciliationHistoryQuery.data?.history?.map((rec: any) => (
                          <TableRow key={rec.id}>
                            <TableCell className="font-mono text-sm">#{rec.id}</TableCell>
                            <TableCell className="text-sm">
                              {new Date(rec.runDate).toLocaleString('pt-BR')}
                            </TableCell>
                            <TableCell>{rec.totalChecked}</TableCell>
                            <TableCell>
                              {rec.totalDivergent > 0 ? (
                                <span className="text-yellow-600 font-medium">{rec.totalDivergent}</span>
                              ) : (
                                <span className="text-green-600">0</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-green-600 font-medium">{rec.totalFixed}</span>
                            </TableCell>
                            <TableCell>
                              {rec.status === 'completed' ? (
                                <Badge className="bg-green-500 text-white">Concluído</Badge>
                              ) : rec.status === 'running' ? (
                                <Badge variant="outline">Executando</Badge>
                              ) : (
                                <Badge variant="destructive">Falhou</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {rec.runBy || 'Sistema'}
                            </TableCell>
                          </TableRow>
                        ))}
                        {(!reconciliationHistoryQuery.data?.history || reconciliationHistoryQuery.data.history.length === 0) && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                              Nenhuma reconciliação executada ainda
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba Visão Consolidada */}
          <TabsContent value="consolidated">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Visão Financeira Consolidada
                </CardTitle>
                <CardDescription>Todas as cobranças do sistema: mensalidades, cotas, combustível e vistorias</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Cards de totais */}
                {financialChargesQuery.data && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                      <p className="text-xs text-muted-foreground">Total Recebido</p>
                      <p className="text-lg font-bold text-green-600">{formatCurrency(financialChargesQuery.data.totals.totalPaid)}</p>
                      <p className="text-xs text-muted-foreground">{financialChargesQuery.data.totals.countPaid} cobranças</p>
                    </div>
                    <div className="bg-yellow-50 dark:bg-yellow-950/20 rounded-lg p-3 border border-yellow-200 dark:border-yellow-800">
                      <p className="text-xs text-muted-foreground">Pendente</p>
                      <p className="text-lg font-bold text-yellow-600">{formatCurrency(financialChargesQuery.data.totals.totalPending)}</p>
                      <p className="text-xs text-muted-foreground">{financialChargesQuery.data.totals.countPending} cobranças</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                      <p className="text-xs text-muted-foreground">Vencido</p>
                      <p className="text-lg font-bold text-red-600">{formatCurrency(financialChargesQuery.data.totals.totalOverdue)}</p>
                      <p className="text-xs text-muted-foreground">{financialChargesQuery.data.totals.countOverdue} cobranças</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-muted-foreground">Por Origem</p>
                      <p className="text-xs mt-1">Assinaturas: <span className="font-semibold">{financialChargesQuery.data.totals.bySource.subscription}</span></p>
                      <p className="text-xs">Combustível: <span className="font-semibold">{financialChargesQuery.data.totals.bySource.fuel}</span></p>
                      <p className="text-xs">Vistorias: <span className="font-semibold">{financialChargesQuery.data.totals.bySource.inspection}</span></p>
                    </div>
                  </div>
                )}

                {/* Filtros */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <Select value={consolidatedStatus} onValueChange={setConsolidatedStatus}>
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos status</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="paid">Pago</SelectItem>
                      <SelectItem value="overdue">Vencido</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={consolidatedType} onValueChange={setConsolidatedType}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos tipos</SelectItem>
                      <SelectItem value="monthly">Mensalidade</SelectItem>
                      <SelectItem value="quota_sale">Venda de Cota</SelectItem>
                      <SelectItem value="fuel">Combustível</SelectItem>
                      <SelectItem value="repair">Reparo</SelectItem>
                      <SelectItem value="other">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={consolidatedSource} onValueChange={setConsolidatedSource}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Origem" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas origens</SelectItem>
                      <SelectItem value="subscription">Assinaturas</SelectItem>
                      <SelectItem value="fuel">Combustível</SelectItem>
                      <SelectItem value="inspection">Vistorias</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={consolidatedMonth} onValueChange={setConsolidatedMonth}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Mês" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos meses</SelectItem>
                      {["01","02","03","04","05","06","07","08","09","10","11","12"].map(m => (
                        <SelectItem key={m} value={m}>{new Date(2000, parseInt(m)-1).toLocaleString('pt-BR', {month: 'long'})}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={consolidatedYear} onValueChange={setConsolidatedYear}>
                    <SelectTrigger className="w-28">
                      <SelectValue placeholder="Ano" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos anos</SelectItem>
                      {["2023","2024","2025","2026"].map(y => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Buscar cliente, e-mail, embarcação..."
                    value={consolidatedSearch}
                    onChange={e => setConsolidatedSearch(e.target.value)}
                    className="w-64"
                  />
                </div>

                {/* Tabela */}
                {financialChargesQuery.isLoading ? (
                  <p className="text-center text-muted-foreground py-8">Carregando visão consolidada...</p>
                ) : financialChargesQuery.isError ? (
                  <p className="text-center text-destructive py-8">Erro ao carregar dados consolidados.</p>
                ) : !financialChargesQuery.data?.charges?.length ? (
                  <p className="text-center text-muted-foreground py-8">Nenhuma cobrança encontrada com os filtros selecionados.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Origem</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Embarcação</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Descrição</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {financialChargesQuery.data.charges.map(charge => (
                          <TableRow key={charge.uid}>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {charge.source_table === 'subscription' ? 'Assinatura' :
                                 charge.source_table === 'fuel' ? 'Combustível' : 'Vistoria'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{charge.client_name || '—'}</div>
                              <div className="text-xs text-muted-foreground">{charge.client_email || '—'}</div>
                            </TableCell>
                            <TableCell className="text-sm">{charge.vessel_name || '—'}</TableCell>
                            <TableCell>
                              <span className="text-xs capitalize">
                                {charge.type === 'monthly' ? 'Mensalidade' :
                                 charge.type === 'quota_sale' ? 'Venda de Cota' :
                                 charge.type === 'fuel' ? 'Combustível' :
                                 charge.type === 'repair' ? 'Reparo' : 'Outros'}
                              </span>
                            </TableCell>
                            <TableCell className="font-semibold">{formatCurrency(parseFloat(charge.value))}</TableCell>
                            <TableCell className="text-sm">
                              {charge.due_date ? new Date(charge.due_date).toLocaleDateString('pt-BR') : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                charge.status === 'paid' ? 'default' :
                                charge.status === 'overdue' ? 'destructive' :
                                charge.status === 'cancelled' ? 'secondary' : 'outline'
                              } className={`text-xs ${
                                charge.status === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                charge.status === 'overdue' ? '' :
                                charge.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''
                              }`}>
                                {charge.status === 'paid' ? 'Pago' :
                                 charge.status === 'overdue' ? 'Vencido' :
                                 charge.status === 'pending' ? 'Pendente' : 'Cancelado'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {charge.description || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de Detalhe de Cobrança */}
      <Dialog open={showChargeDetail} onOpenChange={setShowChargeDetail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da Cobrança #{selectedCharge?.charge?.id}</DialogTitle>
            <DialogDescription>Informações completas da cobrança</DialogDescription>
          </DialogHeader>
          {selectedCharge && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Cliente</p>
                  <p className="font-medium">{selectedCharge.client?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-sm">{selectedCharge.client?.email || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tipo</p>
                  <p className="font-medium">{{
                    monthly: 'Mensalidade',
                    quota_sale: 'Venda de Cota',
                    fuel: 'Abastecimento',
                    repair: 'Reparo',
                    other: 'Outro',
                  }[selectedCharge.charge?.type as string] || selectedCharge.charge?.type || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    selectedCharge.charge?.status === 'paid' ? 'bg-green-100 text-green-700' :
                    selectedCharge.charge?.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    selectedCharge.charge?.status === 'overdue' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {{
                      paid: 'Paga', pending: 'Pendente', overdue: 'Vencida',
                      partial: 'Parcial', cancelled: 'Cancelada',
                    }[selectedCharge.charge?.status as string] || selectedCharge.charge?.status}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Valor</p>
                  <p className="font-bold text-lg">{formatCurrency(parseFloat(selectedCharge.charge?.value || '0'))}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Vencimento</p>
                  <p>{selectedCharge.charge?.dueDate ? new Date(selectedCharge.charge.dueDate).toLocaleDateString('pt-BR') : '-'}</p>
                </div>
                {selectedCharge.charge?.paidDate && (
                  <div>
                    <p className="text-sm text-muted-foreground">Pago em</p>
                    <p>{new Date(selectedCharge.charge.paidDate).toLocaleDateString('pt-BR')}</p>
                  </div>
                )}
                {selectedCharge.charge?.asaasPaymentId && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">ID Asaas</p>
                    <p className="font-mono text-sm break-all">{selectedCharge.charge.asaasPaymentId}</p>
                  </div>
                )}
                {selectedCharge.subscription && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Subscription ID</p>
                    <p className="font-mono text-sm">#{selectedCharge.subscription.id}</p>
                  </div>
                )}
              </div>
              {(selectedCharge.charge?.status === 'pending' || selectedCharge.charge?.status === 'overdue') && selectedCharge.charge?.asaasPaymentId && (
                <div className="flex justify-end pt-4 border-t">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (confirm('Tem certeza que deseja cancelar esta cobrança? A cobrança será removida do sistema e cancelada no Asaas.')) {
                        cancelChargeFromDetailMutation.mutate({ chargeId: selectedCharge.charge.id });
                      }
                    }}
                    disabled={cancelChargeFromDetailMutation.isPending}
                  >
                    {cancelChargeFromDetailMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-2" />
                    )}
                    Cancelar Cobrança
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Criar/Editar */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Cobrança" : "Nova Cobrança"}</DialogTitle>
            <DialogDescription>
              Preencha os dados da Cobrança
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente *</Label>
              <Select
                value={form.clientId.toString()}
                onValueChange={(value) => setForm({ ...form, clientId: parseInt(value) })}
                disabled={!!editingId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo *</Label>
              <Select
                value={form.type}
                onValueChange={(value: "monthly" | "quota_sale" | "fuel" | "repair" | "other") => setForm({ ...form, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensalidade</SelectItem>
                  <SelectItem value="quota_sale">Venda de Cota</SelectItem>
                  <SelectItem value="fuel">Abastecimento</SelectItem>
                  <SelectItem value="repair">Reparos</SelectItem>
                  <SelectItem value="other">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder="0.00"
              />
            </div>

            {/* Campo de Parcelas - Apenas para Venda de Cota */}
            {form.type === "quota_sale" && (
              <div>
                <Label>Número de Parcelas *</Label>
                <Select
                  value={form.installments.toString()}
                  onValueChange={(value) => setForm({ ...form, installments: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1x (à vista)</SelectItem>
                    <SelectItem value="2">2x</SelectItem>
                    <SelectItem value="3">3x</SelectItem>
                    <SelectItem value="4">4x</SelectItem>
                    <SelectItem value="5">5x</SelectItem>
                    <SelectItem value="6">6x</SelectItem>
                    <SelectItem value="7">7x</SelectItem>
                    <SelectItem value="8">8x</SelectItem>
                    <SelectItem value="9">9x</SelectItem>
                    <SelectItem value="10">10x</SelectItem>
                    <SelectItem value="11">11x</SelectItem>
                    <SelectItem value="12">12x</SelectItem>
                    <SelectItem value="13">13x</SelectItem>
                    <SelectItem value="14">14x</SelectItem>
                    <SelectItem value="15">15x</SelectItem>
                    <SelectItem value="16">16x</SelectItem>
                    <SelectItem value="17">17x</SelectItem>
                    <SelectItem value="18">18x</SelectItem>
                    <SelectItem value="19">19x</SelectItem>
                    <SelectItem value="20">20x</SelectItem>
                    <SelectItem value="21">21x</SelectItem>
                    <SelectItem value="22">22x</SelectItem>
                    <SelectItem value="23">23x</SelectItem>
                    <SelectItem value="24">24x</SelectItem>
                    <SelectItem value="25">25x</SelectItem>
                    <SelectItem value="26">26x</SelectItem>
                    <SelectItem value="27">27x</SelectItem>
                    <SelectItem value="28">28x</SelectItem>
                    <SelectItem value="29">29x</SelectItem>
                    <SelectItem value="30">30x</SelectItem>
                    <SelectItem value="31">31x</SelectItem>
                    <SelectItem value="32">32x</SelectItem>
                    <SelectItem value="33">33x</SelectItem>
                    <SelectItem value="34">34x</SelectItem>
                    <SelectItem value="35">35x</SelectItem>
                    <SelectItem value="36">36x</SelectItem>
                  </SelectContent>
                </Select>
                {form.installments > 1 && form.value && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {form.installments}x de {formatCurrency(parseFloat(form.value) / form.installments)}
                  </p>
                )}
              </div>
            )}

            <div>
              <Label>Dia do Vencimento *</Label>
              <Input
                type="number"
                min="1"
                max="31"
                value={form.dueDay}
                onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
              />
            </div>

            <div>
              <Label>Mês de Início *</Label>
              <Input
                type="month"
                value={form.startMonth}
                onChange={(e) => setForm({ ...form, startMonth: e.target.value })}
              />
            </div>

            <div>
              <Label>Data de Término (opcional)</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>

            <div>
              <Label>Reajuste Anual</Label>
              <Select
                value={form.yearlyAdjustment}
                onValueChange={(value: "manual" | "ipca" | "igpm") => setForm({ ...form, yearlyAdjustment: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="ipca">IPCA</SelectItem>
                  <SelectItem value="igpm">IGP-M</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingId ? "Atualizar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Editar Cobrança */}
      <Dialog open={showEditChargeDialog} onOpenChange={setShowEditChargeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cobrança</DialogTitle>
            <DialogDescription>
              Edite os detalhes da cobrança abaixo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo *</Label>
              <Select
                value={editChargeForm.type}
                onValueChange={(value: "monthly" | "quota_sale" | "fuel" | "repair" | "other") => setEditChargeForm({ ...editChargeForm, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensalidade</SelectItem>
                  <SelectItem value="quota_sale">Venda de Cota</SelectItem>
                  <SelectItem value="fuel">Abastecimento</SelectItem>
                  <SelectItem value="repair">Reparos</SelectItem>
                  <SelectItem value="other">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={editChargeForm.value}
                onChange={(e) => setEditChargeForm({ ...editChargeForm, value: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label>Data de Vencimento *</Label>
              <Input
                type="date"
                value={editChargeForm.dueDate}
                onChange={(e) => setEditChargeForm({ ...editChargeForm, dueDate: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditChargeDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (!editingChargeId) return;
                updateChargeMutation.mutate({
                  chargeId: editingChargeId,
                  value: parseFloat(editChargeForm.value),
                  dueDate: editChargeForm.dueDate,
                  type: editChargeForm.type,
                });
              }}
              disabled={updateChargeMutation.isPending}
            >
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
