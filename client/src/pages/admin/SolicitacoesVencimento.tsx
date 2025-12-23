import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar, CheckCircle2, Clock, Loader2, TrendingUp, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function SolicitacoesVencimento() {
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Buscar estatísticas
  const { data: stats, isLoading: loadingStats } = trpc.dueDateRequests.stats.useQuery();

  // Buscar solicitações
  const { data: requests, isLoading: loadingRequests, refetch } = trpc.dueDateRequests.list.useQuery({
    status: selectedStatus,
  });

  // Mutation para aprovar
  const approveMutation = trpc.dueDateRequests.approve.useMutation({
    onSuccess: () => {
      toast.success('Solicitação aprovada com sucesso!');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao aprovar solicitação');
    },
  });

  // Mutation para rejeitar
  const rejectMutation = trpc.dueDateRequests.reject.useMutation({
    onSuccess: () => {
      toast.success('Solicitação rejeitada com sucesso!');
      setShowRejectDialog(false);
      setRejectReason('');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao rejeitar solicitação');
    },
  });

  const handleApprove = (requestId: number) => {
    if (confirm('Tem certeza que deseja aprovar esta solicitação?')) {
      approveMutation.mutate({ requestId });
    }
  };

  const handleReject = () => {
    if (!rejectReason || rejectReason.length < 10) {
      toast.error('Motivo deve ter pelo menos 10 caracteres');
      return;
    }

    rejectMutation.mutate({
      requestId: selectedRequest.id,
      reason: rejectReason,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pendente</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Aprovada</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rejeitada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getChargeTypeBadge = (type: string) => {
    return type === 'inspection' 
      ? <Badge variant="outline">Vistoria</Badge>
      : <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Reparo</Badge>;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  };

  const formatCurrency = (value: string) => {
    return `R$ ${parseFloat(value).toFixed(2)}`;
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Solicitações de Mudança de Vencimento</h1>
        <p className="text-gray-600">Gerencie solicitações de alteração de data de pagamento dos clientes</p>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loadingStats ? '...' : stats?.total || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{loadingStats ? '...' : stats?.pending || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Aprovadas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{loadingStats ? '...' : stats?.approved || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Rejeitadas</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{loadingStats ? '...' : stats?.rejected || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Label>Status</Label>
              <Select value={selectedStatus} onValueChange={(value: any) => setSelectedStatus(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="approved">Aprovadas</SelectItem>
                  <SelectItem value="rejected">Rejeitadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Solicitações */}
      <Card>
        <CardHeader>
          <CardTitle>Solicitações</CardTitle>
          <CardDescription>
            {loadingRequests ? 'Carregando...' : `${requests?.length || 0} solicitações encontradas`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRequests ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : requests && requests.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Embarcação</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Venc. Atual</TableHead>
                    <TableHead>Novo Venc.</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request: any) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.client_email}</TableCell>
                      <TableCell>{getChargeTypeBadge(request.charge_type)}</TableCell>
                      <TableCell>{request.vessel_name}</TableCell>
                      <TableCell>{formatCurrency(request.amount)}</TableCell>
                      <TableCell>{formatDate(request.old_due_date)}</TableCell>
                      <TableCell className="font-semibold text-blue-600">{formatDate(request.new_due_date)}</TableCell>
                      <TableCell className="max-w-xs truncate" title={request.reason}>{request.reason}</TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell>
                        {request.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleApprove(request.id)}
                              disabled={approveMutation.isPending}
                            >
                              {approveMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Aprovar
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setSelectedRequest(request);
                                setShowRejectDialog(true);
                              }}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Rejeitar
                            </Button>
                          </div>
                        )}
                        {request.status === 'approved' && (
                          <span className="text-sm text-gray-500">Processado por: {request.processed_by}</span>
                        )}
                        {request.status === 'rejected' && (
                          <div className="text-sm text-gray-500">
                            <div>Processado por: {request.processed_by}</div>
                            <div className="text-red-600 mt-1" title={request.admin_response}>
                              Motivo: {request.admin_response?.substring(0, 30)}...
                            </div>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Nenhuma solicitação encontrada
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Rejeição */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Solicitação</DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição. O cliente receberá um email com esta justificativa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rejectReason">Motivo da Rejeição</Label>
              <Textarea
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explique o motivo da rejeição (mínimo 10 caracteres)"
                rows={4}
                className="resize-none"
              />
              <p className="text-sm text-gray-500">{rejectReason.length} / 10 caracteres mínimos</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending || rejectReason.length < 10}
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rejeitando...
                </>
              ) : (
                'Confirmar Rejeição'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
