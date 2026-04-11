import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowLeft, Calendar, CheckCircle2, DollarSign, Edit, Loader2, Plus, Trash2, Upload, X, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
// Storage helper
const storagePut = async (key: string, data: ArrayBuffer, contentType: string) => {
  const formData = new FormData();
  const blob = new Blob([data], { type: contentType });
  formData.append('file', blob, key);
  
  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error('Upload failed');
  }
  
  return await response.json();
};

type ChargeType = "inspection" | "repair" | null;

export default function CobrancasDanos() {
  const { user, loading: authLoading } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [chargeType, setChargeType] = useState<ChargeType>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [editingCharge, setEditingCharge] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    // Tipo 'inspection'
    inspectionId: "",
    // Tipo 'repair'
    vesselId: "",
    description: "",
    receiptUrl: "",
    receiptFile: null as File | null,
    // Comuns
    amount: "",
    dueDate: "",
  });

  const [editFormData, setEditFormData] = useState({
    amount: "",
    dueDate: "",
    description: "",
    receiptUrl: "" as string | null,
  });
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null);
  const [uploadingEditReceipt, setUploadingEditReceipt] = useState(false);
  
  // Estados para dialog de solicitação de mudança de vencimento
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  // Estados de filtro
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all_months");
  const [filterYear, setFilterYear] = useState("all_years");
  const [filterClient, setFilterClient] = useState("");

  // Queries
  const { data: charges, isLoading, refetch } = trpc.inspectionCharges.listAll.useQuery({
    status: filterStatus as any,
    month: (filterMonth && filterMonth !== "all_months") ? filterMonth : undefined,
    year: (filterYear && filterYear !== "all_years") ? filterYear : undefined,
    clientSearch: filterClient || undefined,
  });
  const { data: failedInspections } = trpc.inspectionCharges.getFailedInspections.useQuery();
  const { data: vessels } = trpc.vessels.listAll.useQuery();

  // Mutations
  const createMutation = trpc.inspectionCharges.create.useMutation({
    onSuccess: (data) => {
      if (data.charges) {
        toast.success(`${data.charges.length} cobranças criadas com sucesso!`);
      } else {
        toast.success("Cobrança criada com sucesso!");
      }
      setCreateDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao criar cobrança: ${error.message}`);
    },
  });

  const deleteMutation = trpc.inspectionCharges.delete.useMutation({
    onSuccess: () => {
      toast.success("Cobrança excluída com sucesso!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao excluir cobrança: ${error.message}`);
    },
  });

  const markAsPaidMutation = trpc.inspectionCharges.markAsPaid.useMutation({
    onSuccess: () => {
      toast.success("Cobrança marcada como recebida!");
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao marcar como recebida: ${error.message}`);
    },
  });

  const updateMutation = trpc.inspectionCharges.update.useMutation({
    onSuccess: () => {
      toast.success("Cobrança atualizada com sucesso!");
      setEditDialogOpen(false);
      setEditingCharge(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar cobrança: ${error.message}`);
    },
  });

  // Mutations para solicitações de mudança de vencimento
  const approveMutation = trpc.dueDateRequests.approve.useMutation({
    onSuccess: () => {
      toast.success("Solicitação aprovada! Vencimento atualizado.");
      setShowRequestDialog(false);
      setSelectedRequest(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao aprovar: ${error.message}`);
    },
  });

  const rejectMutation = trpc.dueDateRequests.reject.useMutation({
    onSuccess: () => {
      toast.success("Solicitação rejeitada!");
      setShowRejectDialog(false);
      setShowRequestDialog(false);
      setSelectedRequest(null);
      setRejectReason("");
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao rejeitar: ${error.message}`);
    },
  });

  const handleApproveRequest = (requestId: number) => {
    if (confirm("Tem certeza que deseja aprovar esta solicitação? O vencimento será atualizado.")) {
      approveMutation.mutate({ requestId });
    }
  };

  const handleRejectRequest = () => {
    if (!rejectReason || rejectReason.length < 10) {
      toast.error("Motivo deve ter pelo menos 10 caracteres");
      return;
    }
    rejectMutation.mutate({
      requestId: selectedRequest.id,
      reason: rejectReason,
    });
  };

  const resetForm = () => {
    setChargeType(null);
    setFormData({
      inspectionId: "",
      vesselId: "",
      description: "",
      receiptUrl: "",
      receiptFile: null,
      amount: "",
      dueDate: "",
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tamanho (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo: 10MB");
      return;
    }

    // Validar tipo
    const validTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      toast.error("Formato inválido. Use JPG, PNG ou PDF");
      return;
    }

    setFormData({ ...formData, receiptFile: file });
  };

  const uploadReceipt = async (): Promise<string | null> => {
    if (!formData.receiptFile) return null;

    setUploadingReceipt(true);
    try {
      const arrayBuffer = await formData.receiptFile.arrayBuffer();
      
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(7);
      const extension = formData.receiptFile.name.split('.').pop();
      const fileKey = `receipts/${timestamp}-${randomStr}.${extension}`;
      
      const result = await storagePut(fileKey, arrayBuffer, formData.receiptFile.type);
      return result.url;
    } catch (error: any) {
      toast.error(`Erro ao fazer upload: ${error.message}`);
      return null;
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleCreate = async () => {
    if (!chargeType) {
      toast.error("Selecione o tipo de cobrança");
      return;
    }

    // Validação: valor positivo
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Valor total deve ser maior que zero");
      return;
    }

    if (chargeType === "inspection") {
      // Validação: Vistoria Reprovada
      if (!formData.inspectionId) {
        toast.error("Selecione uma vistoria reprovada");
        return;
      }

      const inspection = failedInspections?.find((i: any) => i.id === parseInt(formData.inspectionId));
      if (!inspection) {
        toast.error("Vistoria não encontrada");
        return;
      }

      const inspectionData = typeof inspection.inspection_data === 'string' 
        ? JSON.parse(inspection.inspection_data) 
        : inspection.inspection_data;

      const failedItems = Object.entries(inspectionData)
        .filter(([_, value]) => value === "reprovado")
        .map(([key]) => ({ name: key, status: "reprovado" }));

      const dueDate = formData.dueDate 
        ? new Date(formData.dueDate).getTime() 
        : Date.now() + (7 * 24 * 60 * 60 * 1000);

      createMutation.mutate({
        chargeType: "inspection",
        inspectionId: parseInt(formData.inspectionId),
        failedItems,
        amount,
        dueDate,
      });

    } else {
      // Validação: Reparo da Embarcação
      if (!formData.vesselId || !formData.description) {
        toast.error("Preencha embarcação e descrição do reparo");
        return;
      }

      // Upload do comprovante (se houver)
      let receiptUrl = null;
      if (formData.receiptFile) {
        receiptUrl = await uploadReceipt();
        if (!receiptUrl) return; // Erro no upload
      }

      const dueDate = formData.dueDate 
        ? new Date(formData.dueDate).getTime() 
        : Date.now() + (7 * 24 * 60 * 60 * 1000);

      createMutation.mutate({
        chargeType: "repair",
        vesselId: parseInt(formData.vesselId),
        description: formData.description,
        receiptUrl: receiptUrl || undefined,
        amount,
        dueDate,
      });
    }
  };

  const handleDelete = (chargeId: number) => {
    if (confirm("Tem certeza que deseja EXCLUIR PERMANENTEMENTE esta cobrança? Esta ação não pode ser desfeita.")) {
      deleteMutation.mutate({ chargeId });
    }
  };

  const handleMarkAsPaid = (chargeId: number) => {
    if (confirm("Confirma que recebeu este pagamento manualmente? O sistema irá sincronizar com o Asaas.")) {
      markAsPaidMutation.mutate({ chargeId });
    }
  };

  const handleEdit = (charge: any) => {
    setEditingCharge(charge);
    setEditFormData({
      amount: charge.amount,
      dueDate: new Date(charge.due_date).toISOString().split('T')[0],
      description: charge.description || "",
      receiptUrl: charge.receipt_url || null,
    });
    setEditReceiptFile(null);
    setEditDialogOpen(true);
  };

  const handleEditFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tamanho (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo: 10MB");
      return;
    }

    // Validar tipo
    const validTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      toast.error("Formato inválido. Use JPG, PNG ou PDF");
      return;
    }

    setEditReceiptFile(file);
  };

  const uploadEditReceipt = async (): Promise<string | null> => {
    if (!editReceiptFile) return null;

    setUploadingEditReceipt(true);
    try {
      const arrayBuffer = await editReceiptFile.arrayBuffer();
      
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(7);
      const extension = editReceiptFile.name.split('.').pop();
      const fileKey = `receipts/${timestamp}-${randomStr}.${extension}`;
      
      const result = await storagePut(fileKey, arrayBuffer, editReceiptFile.type);
      return result.url;
    } catch (error: any) {
      toast.error(`Erro ao fazer upload: ${error.message}`);
      return null;
    } finally {
      setUploadingEditReceipt(false);
    }
  };

  const handleRemoveEditImage = () => {
    setEditFormData({ ...editFormData, receiptUrl: null });
    setEditReceiptFile(null);
  };

  const handleUpdateSubmit = async () => {
    if (!editingCharge) return;

    const amount = parseFloat(editFormData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Valor deve ser maior que zero");
      return;
    }

    const newDueDate = new Date(editFormData.dueDate).getTime();

    // Se há um novo arquivo para upload
    let newReceiptUrl = editFormData.receiptUrl;
    if (editReceiptFile) {
      const uploadedUrl = await uploadEditReceipt();
      if (!uploadedUrl) return; // Erro no upload
      newReceiptUrl = uploadedUrl;
    }

    updateMutation.mutate({
      chargeId: editingCharge.id,
      newAmount: amount,
      newDueDate,
      receiptUrl: newReceiptUrl,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      paid: "default",
      overdue: "destructive",
    };

    const labels: Record<string, string> = {
      pending: "Pendente",
      paid: "Pago",
      overdue: "Vencido",
    };

    return (
      <Badge variant={variants[status] || "outline"}>
        {labels[status] || status}
      </Badge>
    );
  };

  const getTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      inspection: "Vistoria",
      repair: "Reparo",
    };

    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        {labels[type] || type}
      </Badge>
    );
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>
              Você não tem permissão para acessar esta página.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const totalPending = charges?.filter((c: any) => c.payment_status === "pending").length || 0;
  const totalAmount = charges?.reduce((sum: number, c: any) => sum + parseFloat(c.amount || 0), 0) || 0;

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Cobranças de Danos</h1>
            <p className="text-muted-foreground">
              Gerencie cobranças após vistorias reprovadas ou reparos de embarcações
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Cobrança
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Cobranças</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{charges?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {totalPending} pendentes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalAmount)}</div>
            <p className="text-xs text-muted-foreground">
              Todas as cobranças
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Cobranças */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Cobranças</CardTitle>
          <CardDescription>
            Visualize e gerencie todas as cobranças de danos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filtros */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
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
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_months">Todos meses</SelectItem>
                {["01","02","03","04","05","06","07","08","09","10","11","12"].map(m => (
                  <SelectItem key={m} value={m}>
                    {new Date(2000, parseInt(m)-1).toLocaleString('pt-BR', {month: 'long'})}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-28">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_years">Todos anos</SelectItem>
                {["2023","2024","2025","2026"].map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar cliente..."
              value={filterClient}
              onChange={e => setFilterClient(e.target.value)}
              className="w-52"
            />
            {(filterStatus !== "all" || filterMonth !== "all_months" || filterYear !== "all_years" || filterClient) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFilterStatus("all"); setFilterMonth("all_months"); setFilterYear("all_years"); setFilterClient(""); }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : charges && charges.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Tipo</th>
                    <th className="text-left p-2">Cliente</th>
                    <th className="text-left p-2">Embarcação</th>
                    <th className="text-left p-2">Valor</th>
                    <th className="text-left p-2">Vencimento</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-center p-2">Solicitações</th>
                    <th className="text-right p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((charge: any) => (
                    <tr key={charge.id} className={`border-b hover:bg-muted/50 ${charge.pending_due_date_request ? 'bg-amber-50' : ''}`}>
                      <td className="p-2">{getTypeBadge(charge.charge_type)}</td>
                      <td className="p-2">{charge.client_email}</td>
                      <td className="p-2">{charge.vessel_name}</td>
                      <td className="p-2 font-medium">{formatCurrency(parseFloat(charge.amount))}</td>
                      <td className="p-2">{formatDate(charge.due_date)}</td>
                      <td className="p-2">{getStatusBadge(charge.payment_status)}</td>
                      <td className="p-2 text-center">
                        {charge.pending_due_date_request ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200"
                            onClick={() => {
                              setSelectedRequest({
                                ...charge.pending_due_date_request,
                                charge_id: charge.id,
                                client_email: charge.client_email,
                                vessel_name: charge.vessel_name,
                                amount: charge.amount,
                                current_due_date: charge.due_date,
                              });
                              setShowRequestDialog(true);
                            }}
                          >
                            <AlertTriangle className="w-4 h-4 mr-1" />
                            Pendente
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(charge.payment_status === 'pending' || charge.payment_status === 'overdue') && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleMarkAsPaid(charge.id)}
                                title="Marcar como recebido"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(charge)}
                                title="Editar cobrança"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(charge.id)}
                            title="Excluir permanentemente"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma cobrança cadastrada
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Nova Cobrança */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Cobrança de Danos</DialogTitle>
            <DialogDescription>
              Cadastre uma cobrança após orçamento aprovado pelo cliente
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* ETAPA 1: Seleção do Tipo */}
            <div className="space-y-2">
              <Label>Tipo de Cobrança *</Label>
              <RadioGroup value={chargeType || ""} onValueChange={(value) => setChargeType(value as ChargeType)}>
                <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="inspection" id="type-inspection" />
                  <Label htmlFor="type-inspection" className="cursor-pointer flex-1">
                    <div className="font-medium">Vistoria Reprovada</div>
                    <div className="text-sm text-muted-foreground">
                      Cobrança baseada em vistoria com itens reprovados
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="repair" id="type-repair" />
                  <Label htmlFor="type-repair" className="cursor-pointer flex-1">
                    <div className="font-medium">Reparo da Embarcação</div>
                    <div className="text-sm text-muted-foreground">
                      Rateio automático entre cotistas da embarcação
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* CAMPOS CONDICIONAIS */}
            {chargeType === "inspection" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="inspectionId">Vistoria Reprovada *</Label>
                  <Select
                    value={formData.inspectionId}
                    onValueChange={(value) => setFormData({ ...formData, inspectionId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma vistoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {failedInspections && failedInspections.length > 0 ? (
                        failedInspections.map((inspection: any) => (
                          <SelectItem key={inspection.id} value={inspection.id.toString()}>
                            {inspection.vessel_name} - {inspection.client_name} ({formatDate(inspection.created_at)})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>
                          Nenhuma vistoria reprovada disponível
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {chargeType === "repair" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="vesselId">Embarcação *</Label>
                  <Select
                    value={formData.vesselId}
                    onValueChange={(value) => setFormData({ ...formData, vesselId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma embarcação" />
                    </SelectTrigger>
                    <SelectContent>
                      {vessels && vessels.length > 0 ? (
                        vessels.map((vessel: any) => (
                          <SelectItem key={vessel.id} value={vessel.id.toString()}>
                            {vessel.name} ({vessel.quota_count} cotas)
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>
                          Nenhuma embarcação disponível
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição do Item *</Label>
                  <Textarea
                    id="description"
                    placeholder="Descreva o reparo realizado..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="receipt">Upload de Comprovante</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="receipt"
                      type="file"
                      accept="image/jpeg,image/png,image/jpg,application/pdf"
                      onChange={handleFileChange}
                    />
                    {formData.receiptFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setFormData({ ...formData, receiptFile: null })}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  {formData.receiptFile && (
                    <p className="text-sm text-muted-foreground">
                      Arquivo: {formData.receiptFile.name} ({(formData.receiptFile.size / 1024).toFixed(2)} KB)
                    </p>
                  )}
                </div>
              </>
            )}

            {/* CAMPOS COMUNS (aparecem após selecionar tipo) */}
            {chargeType && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="amount">Valor Total (R$) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="Ex: 150.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  />
                  {chargeType === "repair" && formData.vesselId && (
                    <p className="text-sm text-muted-foreground">
                      O valor será dividido automaticamente entre os cotistas da embarcação
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dueDate">Data de Vencimento (opcional)</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  />
                  <p className="text-sm text-muted-foreground">
                    Padrão: 7 dias após criação da cobrança
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || uploadingReceipt || !chargeType}
            >
              {createMutation.isPending || uploadingReceipt ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {uploadingReceipt ? "Enviando..." : "Criando..."}
                </>
              ) : (
                "Criar Cobrança"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Cobrança */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Cobrança</DialogTitle>
            <DialogDescription>
              Atualize o valor e/ou vencimento da cobrança
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {editingCharge && (
              <div className="p-3 bg-muted rounded-lg space-y-1">
                <p className="text-sm font-medium">
                  {editingCharge.charge_type === 'inspection' ? 'Vistoria' : 'Reparo'} - {editingCharge.vessel_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  Cliente: {editingCharge.client_email}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-amount">Valor (R$) *</Label>
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                placeholder="Ex: 150.00"
                value={editFormData.amount}
                onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-dueDate">Data de Vencimento *</Label>
              <Input
                id="edit-dueDate"
                type="date"
                value={editFormData.dueDate}
                onChange={(e) => setEditFormData({ ...editFormData, dueDate: e.target.value })}
              />
            </div>

            {/* Seção de Imagem - apenas para reparos */}
            {editingCharge?.charge_type === 'repair' && (
              <div className="space-y-2">
                <Label>Foto do Reparo</Label>
                
                {/* Exibir imagem existente ou nova */}
                {(editFormData.receiptUrl || editReceiptFile) && (
                  <div className="relative">
                    <div className="border rounded-lg overflow-hidden bg-muted">
                      {editReceiptFile ? (
                        // Preview do novo arquivo
                        editReceiptFile.type.startsWith('image/') ? (
                          <img
                            src={URL.createObjectURL(editReceiptFile)}
                            alt="Preview da nova imagem"
                            className="w-full h-48 object-contain"
                          />
                        ) : (
                          <div className="w-full h-48 flex items-center justify-center text-muted-foreground">
                            <div className="text-center">
                              <Upload className="w-8 h-8 mx-auto mb-2" />
                              <p className="text-sm">{editReceiptFile.name}</p>
                              <p className="text-xs">(PDF)</p>
                            </div>
                          </div>
                        )
                      ) : editFormData.receiptUrl ? (
                        // Imagem existente
                        editFormData.receiptUrl.toLowerCase().endsWith('.pdf') ? (
                          <a
                            href={editFormData.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full h-48 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                          >
                            <div className="text-center">
                              <Upload className="w-8 h-8 mx-auto mb-2" />
                              <p className="text-sm">Visualizar PDF</p>
                              <p className="text-xs text-primary underline">Clique para abrir</p>
                            </div>
                          </a>
                        ) : (
                          <a
                            href={editFormData.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={editFormData.receiptUrl}
                              alt="Foto do reparo"
                              className="w-full h-48 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                            />
                          </a>
                        )
                      ) : null}
                    </div>
                    
                    {/* Botão de remover */}
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8"
                      onClick={handleRemoveEditImage}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                
                {/* Input para nova imagem */}
                <div className="flex items-center gap-2">
                  <Input
                    id="edit-receipt"
                    type="file"
                    accept="image/jpeg,image/png,image/jpg,application/pdf"
                    onChange={handleEditFileChange}
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {editFormData.receiptUrl || editReceiptFile 
                    ? "Selecione um novo arquivo para substituir a imagem atual"
                    : "Formatos aceitos: JPG, PNG ou PDF (máx. 10MB)"}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setEditingCharge(null);
                setEditReceiptFile(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpdateSubmit}
              disabled={updateMutation.isPending || uploadingEditReceipt}
            >
              {updateMutation.isPending || uploadingEditReceipt ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {uploadingEditReceipt ? "Enviando imagem..." : "Atualizando..."}
                </>
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Visualizar Solicitação de Mudança de Vencimento */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Solicitação de Mudança de Vencimento
            </DialogTitle>
            <DialogDescription>
              O cliente solicitou alteração da data de vencimento
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Cliente:</span>
                  <span className="font-medium">{selectedRequest.client_email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Embarcação:</span>
                  <span className="font-medium">{selectedRequest.vessel_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Valor:</span>
                  <span className="font-medium">{formatCurrency(parseFloat(selectedRequest.amount))}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 border rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Vencimento Atual</p>
                  <p className="font-medium">{formatDate(selectedRequest.current_due_date)}</p>
                </div>
                <div className="p-3 border-2 border-amber-300 bg-amber-50 rounded-lg">
                  <p className="text-xs text-amber-700 mb-1">Novo Vencimento</p>
                  <p className="font-medium text-amber-800">{formatDate(selectedRequest.new_due_date)}</p>
                </div>
              </div>

              {selectedRequest.reason && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Motivo do Cliente:</p>
                  <p className="text-sm">{selectedRequest.reason}</p>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                Solicitado em: {formatDate(selectedRequest.created_at)}
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRequestDialog(false)}
            >
              Fechar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowRejectDialog(true);
              }}
              disabled={rejectMutation.isPending}
            >
              <XCircle className="w-4 h-4 mr-1" />
              Rejeitar
            </Button>
            <Button
              onClick={() => handleApproveRequest(selectedRequest?.id)}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-1" />
              )}
              Aprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Rejeitar Solicitação */}
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
              <p className="text-sm text-muted-foreground">{rejectReason.length} / 10 caracteres mínimos</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectRequest}
              disabled={rejectMutation.isPending || rejectReason.length < 10}
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Rejeitando...
                </>
              ) : (
                "Confirmar Rejeição"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
