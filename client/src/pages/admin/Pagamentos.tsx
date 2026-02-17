/**
 * Dashboard Admin - Pagamentos
 * 
 * Visualização completa de pagamentos, logs de webhook e reconciliação.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  CreditCard,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  FileText,
  History,
  Webhook,
  Eye,
  Play,
} from "lucide-react";

export default function Pagamentos() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchEmail, setSearchEmail] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<any>(null);

  // Queries
  const paymentsQuery = trpc.payments.adminList.useQuery({
    status: statusFilter as any,
    chargeType: typeFilter as any,
    clientEmail: searchEmail || undefined,
    limit: 50,
  });

  const statsQuery = trpc.payments.stats.useQuery();
  const webhookLogsQuery = trpc.payments.webhookLogs.useQuery({ limit: 50 });
  const reconciliationHistoryQuery = trpc.payments.reconciliationHistory.useQuery({ limit: 10 });

  // Mutations
  const runReconciliationMutation = trpc.payments.runReconciliation.useMutation({
    onSuccess: (data) => {
      toast.success(`Reconciliação concluída: ${data.totalChecked} verificados, ${data.totalFixed} corrigidos`);
      paymentsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Erro na reconciliação: ${error.message}`);
    },
  });

  const runMaintenanceMutation = trpc.payments.runMaintenance.useMutation({
    onSuccess: () => {
      toast.success("Tarefas de manutenção executadas com sucesso");
      paymentsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Erro na manutenção: ${error.message}`);
    },
  });

  const cancelPaymentMutation = trpc.payments.cancel.useMutation({
    onSuccess: () => {
      toast.success("Pagamento cancelado com sucesso");
      paymentsQuery.refetch();
      setSelectedPayment(null);
    },
    onError: (error) => {
      toast.error(`Erro ao cancelar: ${error.message}`);
    },
  });

  // Helpers
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-300"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      case 'confirmed':
      case 'received':
        return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Pago</Badge>;
      case 'overdue':
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Vencido</Badge>;
      case 'cancelled':
      case 'failed':
        return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const types: Record<string, { label: string; color: string }> = {
      fuel: { label: 'Combustível', color: 'bg-orange-100 text-orange-800' },
      inspection: { label: 'Vistoria', color: 'bg-blue-100 text-blue-800' },
      repair: { label: 'Reparo', color: 'bg-purple-100 text-purple-800' },
      booking: { label: 'Reserva', color: 'bg-green-100 text-green-800' },
      monthly: { label: 'Mensalidade', color: 'bg-cyan-100 text-cyan-800' },
    };
    const config = types[type] || { label: type, color: 'bg-gray-100 text-gray-800' };
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Header com botão voltar */}
      <div className="border-b bg-white sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/admin')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm sm:text-base md:text-xl font-bold truncate">Exclusive Club - Compartilhando Sonhos</h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Pagamentos</h1>
            <p className="text-muted-foreground">Gerencie cobranças e acompanhe pagamentos</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
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
              className="w-full sm:w-auto"
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

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Recebido</CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(statsQuery.data?.totalReceived || 0)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pendente</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-yellow-600">
                    {formatCurrency(statsQuery.data?.totalPending || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {statsQuery.data?.pending || 0} cobranças
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vencido</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(statsQuery.data?.totalOverdue || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {statsQuery.data?.overdue || 0} cobranças
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Pagamentos</CardTitle>
              <CreditCard className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{statsQuery.data?.total || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {statsQuery.data?.paid || 0} pagos
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="payments" className="space-y-4">
          <TabsList>
            <TabsTrigger value="payments">
              <CreditCard className="h-4 w-4 mr-2" />
              Pagamentos
            </TabsTrigger>
            <TabsTrigger value="webhooks">
              <Webhook className="h-4 w-4 mr-2" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="reconciliation">
              <History className="h-4 w-4 mr-2" />
              Reconciliação
            </TabsTrigger>
          </TabsList>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <Input
                      placeholder="Buscar por email..."
                      value={searchEmail}
                      onChange={(e) => setSearchEmail(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="paid">Pago</SelectItem>
                      <SelectItem value="overdue">Vencido</SelectItem>
                      <SelectItem value="failed">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="fuel">Combustível</SelectItem>
                      <SelectItem value="inspection">Vistoria</SelectItem>
                      <SelectItem value="repair">Reparo</SelectItem>
                      <SelectItem value="booking">Reserva</SelectItem>
                      <SelectItem value="monthly">Mensalidade</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => paymentsQuery.refetch()}>
                    <Search className="h-4 w-4 mr-2" />
                    Buscar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Payments Table */}
            <Card>
              <CardContent className="pt-6">
                {paymentsQuery.isLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Criado em</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentsQuery.data?.payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-mono text-sm">
                            #{payment.id}
                          </TableCell>
                          <TableCell>{getTypeBadge(payment.chargeType)}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {payment.clientEmail}
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(payment.value)}
                          </TableCell>
                          <TableCell>{getStatusBadge(payment.status)}</TableCell>
                          <TableCell className="text-sm">
                            {formatDate(payment.dueDate)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(payment.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedPayment(payment)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {paymentsQuery.data?.payments.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            Nenhum pagamento encontrado
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Webhooks Tab */}
          <TabsContent value="webhooks">
            <Card>
              <CardHeader>
                <CardTitle>Logs de Webhook</CardTitle>
                <CardDescription>
                  Histórico de notificações recebidas do Asaas
                </CardDescription>
              </CardHeader>
              <CardContent>
                {webhookLogsQuery.isLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
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
                      {webhookLogsQuery.data?.logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-sm">#{log.id}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{log.eventType}</Badge>
                          </TableCell>
                          <TableCell>
                            {log.processed ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {log.ipAddress}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(log.createdAt)}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-red-600 text-sm">
                            {log.errorMessage}
                          </TableCell>
                        </TableRow>
                      ))}
                      {webhookLogsQuery.data?.logs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            Nenhum log de webhook encontrado
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reconciliation Tab */}
          <TabsContent value="reconciliation">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Reconciliações</CardTitle>
                <CardDescription>
                  Execuções anteriores de verificação de consistência
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reconciliationHistoryQuery.isLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
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
                      {reconciliationHistoryQuery.data?.history.map((rec) => (
                        <TableRow key={rec.id}>
                          <TableCell className="font-mono text-sm">#{rec.id}</TableCell>
                          <TableCell className="text-sm">
                            {formatDate(rec.runDate)}
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
                              <Badge variant="default" className="bg-green-500">Concluído</Badge>
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
                      {reconciliationHistoryQuery.data?.history.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            Nenhuma reconciliação executada ainda
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Payment Detail Dialog */}
        <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Detalhes do Pagamento #{selectedPayment?.id}</DialogTitle>
              <DialogDescription>
                Informações completas da cobrança
              </DialogDescription>
            </DialogHeader>
            {selectedPayment && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Tipo</p>
                    <p>{getTypeBadge(selectedPayment.chargeType)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <p>{getStatusBadge(selectedPayment.status)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Valor</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedPayment.value)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Líquido</p>
                    <p className="font-medium">
                      {selectedPayment.netValue ? formatCurrency(selectedPayment.netValue) : '-'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Cliente</p>
                    <p>{selectedPayment.clientEmail}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Vencimento</p>
                    <p>{formatDate(selectedPayment.dueDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pagamento</p>
                    <p>{selectedPayment.paymentDate ? formatDate(selectedPayment.paymentDate) : '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">ID Asaas</p>
                    <p className="font-mono text-sm">{selectedPayment.asaasPaymentId}</p>
                  </div>
                  {selectedPayment.description && (
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Descrição</p>
                      <p>{selectedPayment.description}</p>
                    </div>
                  )}
                </div>

                {selectedPayment.status === 'pending' && (
                  <div className="flex justify-end pt-4 border-t">
                    <Button
                      variant="destructive"
                      onClick={() => cancelPaymentMutation.mutate({ paymentId: selectedPayment.id })}
                      disabled={cancelPaymentMutation.isPending}
                    >
                      {cancelPaymentMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      Cancelar Pagamento
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
