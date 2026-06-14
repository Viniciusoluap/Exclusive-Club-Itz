import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, ClipboardCheck, CheckCircle2, XCircle, ArrowLeft, Trash2, FileText } from "lucide-react";
import { Link } from "wouter";

const JET_FIELDS = [
  "PINTURA / CASCO",
  "LUZES GERAL",
  "CARPETE EVA",
  "BANCO",
  "COLETES",
  "MOTOR",
  "TURBINA",
  "IBR",
  "CHAVE",
  "CARRETINHA E PNEUS",
  "ESCADA",
  "SISTEMA ELETRICO",
  "OUTROS",
];

const LANCHA_FIELDS = [
  "PINTURA / CASCO",
  "LUZES GERAL",
  "CARPETE EVA",
  "BANCOS E ESTOFADOS",
  "ANCORA",
  "COLETES",
  "MOTOR",
  "HELICE",
  "TRIM DO MOTOR",
  "CHAVE",
  "CARRETINHA E PNEUS",
  "TOLDO",
  "ESCADA",
  "SOM",
  "SISTEMA ELETRICO",
  "BANHEIRO",
  "BOIA",
  "DEFENSERS",
  "SONAR",
  "OUTROS",
];

export default function Vistorias() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [vesselType, setVesselType] = useState<'jetski' | 'lancha' | null>(null);
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [clientName, setClientName] = useState("");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [reprovationPhotos, setReprovationPhotos] = useState<Record<string, File | null>>({});
  const [notes, setNotes] = useState("");
  const [selectedInspections, setSelectedInspections] = useState<number[]>([]);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [showAllInspections, setShowAllInspections] = useState(false);

  const trpcAny = trpc as any;
  const { data: recentBookings } = trpcAny.bookings?.getRecent.useQuery({ onlyUsed: true }) || { data: [] }; // Busca apenas reservas utilizadas
  const { data: inspections, refetch } = trpcAny.inspections?.list.useQuery({}) || { data: [] };
  const { data: vessels } = trpc.vessels.list.useQuery();

  // BPO: dados financeiros de cobranças de reparo
  const currentYear = new Date().getFullYear();
  const { data: bpoRepairStats } = trpc.bpo.getStats.useQuery(
    { year: String(currentYear), type: 'repair' },
    { enabled: true }
  );

  const createMutation = trpcAny.inspections?.create.useMutation({
    onSuccess: () => {
      toast.success("Vistoria registrada com sucesso!");
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao registrar vistoria: ${error.message}`);
    },
  });

  const deleteMutation = trpcAny.inspections?.delete.useMutation({
    onSuccess: () => {
      toast.success('Vistoria excluída com sucesso!');
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao excluir vistoria: ${error.message}`);
    },
  });

  const generateReportMutation = trpcAny.inspections?.generateReport.useMutation({
    onSuccess: (data: any) => {
      // Baixar PDF automaticamente
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${data.pdfBase64}`;
      link.download = `relatorio-vistorias-${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      toast.success(`Relatório de ${data.count} vistorias gerado com sucesso!`);
      setSelectedInspections([]);
    },
    onError: (error: any) => {
      toast.error(`Erro ao gerar relatório: ${error.message}`);
    },
  });

  const sendEmailMutation = trpcAny.inspections?.sendReportByEmail.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Relatório de ${data.count} vistoria(s) enviado para ${emailRecipient}!`);
      setIsEmailDialogOpen(false);
      setEmailRecipient("");
      setSelectedInspections([]);
    },
    onError: (error: any) => {
      toast.error(`Erro ao enviar relatório: ${error.message}`);
    },
  });

  const toggleInspectionSelection = (id: number) => {
    setSelectedInspections(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedInspections.length === inspections?.length) {
      setSelectedInspections([]);
    } else {
      setSelectedInspections(inspections?.map((i: any) => i.id) || []);
    }
  };

  const handleGenerateReport = () => {
    if (selectedInspections.length === 0) {
      toast.error("Selecione pelo menos uma vistoria");
      return;
    }
    generateReportMutation.mutate({ inspectionIds: selectedInspections });
  };

  const handleSendEmail = () => {
    if (selectedInspections.length === 0) {
      toast.error("Selecione pelo menos uma vistoria");
      return;
    }
    setIsEmailDialogOpen(true);
  };

  const resetForm = () => {
    setSelectedBookingId(null);
    setVesselType(null);
    setInspectionDate(new Date().toISOString().split('T')[0]);
    setClientName("");
    setFormData({});
    setReprovationPhotos({});
    setNotes("");
  };

  const handleDeleteClick = (id: number) => {
    setDeleteId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate({ id: deleteId });
    }
  };

  const handleBookingChange = (bookingId: string) => {
    const id = parseInt(bookingId);
    setSelectedBookingId(id);
    
    const booking = recentBookings?.find((b: any) => b.id === id);
    if (booking) {
      setClientName(booking.clientName);
      // Não define automaticamente - usuário escolhe manualmente
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!selectedBookingId || !vesselType) {
      toast.error("Selecione uma reserva");
      return;
    }

    const booking = recentBookings?.find((b: any) => b.id === selectedBookingId);
    if (!booking) {
      toast.error("Reserva não encontrada");
      return;
    }

    const fields = vesselType === 'jetski' ? JET_FIELDS : LANCHA_FIELDS;
    const missingFields = fields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      toast.error(`Preencha todos os campos: ${missingFields.join(', ')}`);
      return;
    }

    // Upload de fotos de itens reprovados
    const uploadedPhotos: Array<{itemName: string, photoUrl: string}> = [];
    const photoEntries = Object.entries(reprovationPhotos).filter(([_, file]) => file !== null);
    
    if (photoEntries.length > 0) {
      toast.info(`Fazendo upload de ${photoEntries.length} foto(s)...`);
      
      for (const [itemName, file] of photoEntries) {
        if (!file) continue;
        
        try {
          const formData = new FormData();
          formData.append('photo', file);
          formData.append('itemName', itemName);
          formData.append('vesselId', booking.vesselId.toString());
          
          const response = await fetch('/api/upload-inspection-photo', {
            method: 'POST',
            body: formData,
          });
          
          if (!response.ok) {
            throw new Error(`Erro ao fazer upload da foto ${itemName}`);
          }
          
          const data = await response.json();
          uploadedPhotos.push({ itemName: data.itemName, photoUrl: data.photoUrl });
        } catch (error: any) {
          console.error(`Erro ao fazer upload da foto ${itemName}:`, error);
          toast.error(`Erro ao fazer upload da foto ${itemName}`);
        }
      }
    }

    createMutation.mutate({
      bookingId: selectedBookingId,
      vesselId: booking.vesselId,
      vesselType,
      clientName,
      formData,
      observations: notes || undefined,
      reprovationPhotos: uploadedPhotos.length > 0 ? uploadedPhotos : undefined,
    });
  };

  const currentFields = vesselType === 'jetski' ? JET_FIELDS : vesselType === 'lancha' ? LANCHA_FIELDS : [];

  return (
    <div className="container py-8">
      <div className="mb-6">
        <Link href="/admin">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Vistorias</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Registre vistorias das embarcações antes e após o uso
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={handleGenerateReport}
              disabled={generateReportMutation.isPending || selectedInspections.length === 0}
              className="w-full sm:w-auto"
            >
              {generateReportMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Gerar PDF ({selectedInspections.length})
                </>
              )}
            </Button>
            <Button 
              variant="outline"
              onClick={handleSendEmail}
              disabled={selectedInspections.length === 0}
              className="w-full sm:w-auto"
            >
              <FileText className="w-4 h-4 mr-2" />
              Enviar por Email ({selectedInspections.length})
            </Button>
            <Button onClick={() => setIsCreateDialogOpen(true)} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Nova Vistoria
            </Button>
          </div>
        </div>
      </div>

      {/* Card BPO: Cobranças de Reparo */}
      {bpoRepairStats && (
        <Card className="mb-6 border-orange-200 bg-orange-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-orange-600" />
              Cobranças BPO — Reparos ({currentYear})
            </CardTitle>
            <p className="text-xs text-muted-foreground">Dados financeiros centralizados de bpo_charges</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center p-2 bg-white rounded-lg border">
                <p className="text-xs text-muted-foreground">Total Cobrado</p>
                <p className="font-bold text-sm">R$ {bpoRepairStats.totalExpected.toFixed(2)}</p>
              </div>
              <div className="text-center p-2 bg-white rounded-lg border">
                <p className="text-xs text-muted-foreground">Recebido</p>
                <p className="font-bold text-sm text-green-600">R$ {bpoRepairStats.totalPaid.toFixed(2)}</p>
              </div>
              <div className="text-center p-2 bg-white rounded-lg border">
                <p className="text-xs text-muted-foreground">Pendente</p>
                <p className="font-bold text-sm text-yellow-600">R$ {bpoRepairStats.totalPending.toFixed(2)}</p>
              </div>
              <div className="text-center p-2 bg-white rounded-lg border">
                <p className="text-xs text-muted-foreground">Vencido</p>
                <p className="font-bold text-sm text-red-600">R$ {bpoRepairStats.totalOverdue.toFixed(2)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{bpoRepairStats.totalCount} cobranças de reparo no BPO</p>
          </CardContent>
        </Card>
      )}

      {/* Recent Inspections */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-xl font-semibold">Vistorias Recentes</h2>
          <div className="flex items-center gap-2">
            {inspections && inspections.length > 4 && (
              <div className="flex gap-1 border rounded-md p-1">
                <Button 
                  variant={!showAllInspections ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setShowAllInspections(false)}
                >
                  Últimas 4
                </Button>
                <Button 
                  variant={showAllInspections ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setShowAllInspections(true)}
                >
                  Mostrar Todas
                </Button>
              </div>
            )}
            {inspections && inspections.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={toggleSelectAll}
              >
                {selectedInspections.length === inspections.length ? 'Desmarcar Todas' : 'Selecionar Todas'}
              </Button>
            )}
          </div>
        </div>
        {!inspections || inspections.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma vistoria registrada
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {(() => {
              // Ordenar por data mais recente primeiro
              const sortedInspections = [...inspections].sort((a: any, b: any) => {
                const dateA = new Date(a.createdAt).getTime();
                const dateB = new Date(b.createdAt).getTime();
                return dateB - dateA; // Mais recente primeiro
              });
              
              // Aplicar filtro de visualização (últimas 4 ou todas)
              const displayedInspections = showAllInspections 
                ? sortedInspections 
                : sortedInspections.slice(0, 4);
              
              return displayedInspections.map((inspection: any) => {
              // inspectionData already comes as object from backend
              const formData = inspection.inspectionData || {};
              const approvedCount = Object.values(formData).filter(v => v === 'APROVADO').length;
              const totalFields = Object.keys(formData).length;
              const failedCount = totalFields - approvedCount;
              const isFullyApproved = failedCount === 0;

              return (
                <Card key={inspection.id} className={selectedInspections.includes(inspection.id) ? 'ring-2 ring-primary' : ''}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedInspections.includes(inspection.id)}
                          onChange={() => toggleInspectionSelection(inspection.id)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                        />
                        <ClipboardCheck className="w-5 h-5 text-primary" />
                        <div>
                          <CardTitle className="text-lg">{inspection.vesselName}</CardTitle>
                          <CardDescription>
                            {inspection.clientName} • {new Date(inspection.bookingDate || inspection.createdAt).toLocaleDateString('pt-BR')}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-start gap-4">
                        <div className="text-right flex-1">
                          {isFullyApproved ? (
                            <div className="flex items-center gap-2 text-blue-600">
                              <CheckCircle2 className="w-5 h-5" />
                              <span className="font-semibold">Aprovado</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-red-600">
                              <XCircle className="w-5 h-5" />
                              <span className="font-semibold">
                                Reprovado {failedCount}
                              </span>
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(inspection.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm space-y-2">
                      <p><strong>Tipo:</strong> {inspection.vesselType === 'jetski' ? 'Jet Ski' : 'Lancha'}</p>
                      <p><strong>Vistoriado por:</strong> {inspection.inspectedBy || 'N/A'}</p>
                      {inspection.observations && (
                        <p><strong>Observações:</strong> {inspection.observations}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            });
            })()}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Nova Vistoria</DialogTitle>
              <DialogDescription>
                Preencha o formulário de vistoria da embarcação
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              {/* Booking Selection */}
              <div className="grid gap-2">
                <Label htmlFor="booking">Reserva *</Label>
                <Select 
                  value={selectedBookingId?.toString()} 
                  onValueChange={handleBookingChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma reserva" />
                  </SelectTrigger>
                  <SelectContent>
                    {recentBookings?.map((booking: any) => {
                      const vessel = vessels?.find(v => v.id === booking.vesselId);
                      return (
                        <SelectItem key={booking.id} value={booking.id.toString()}>
                          {vessel?.name} - {booking.clientName} ({new Date(booking.startTime).toLocaleDateString('pt-BR')})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Inspection Date */}
              <div className="grid gap-2">
                <Label htmlFor="inspectionDate">Data da Vistoria *</Label>
                <Input
                  id="inspectionDate"
                  type="date"
                  value={inspectionDate}
                  onChange={(e) => setInspectionDate(e.target.value)}
                  required
                />
              </div>

              {/* Vessel Type Selection */}
              <div className="grid gap-2">
                <Label htmlFor="vesselType">Tipo de Embarcação *</Label>
                <Select 
                  value={vesselType || undefined} 
                  onValueChange={(value) => {
                    setVesselType(value as 'jetski' | 'lancha');
                    setFormData({}); // Limpa formData ao trocar tipo
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jetski">Jetski</SelectItem>
                    <SelectItem value="lancha">Lancha</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Inspection Fields */}
              {vesselType && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold text-lg">
                    Checklist - {vesselType === 'jetski' ? 'Jet Ski GTI 130' : 'Focker 215'}
                  </h3>
                  
                  {currentFields.map((field, index) => (
                    <div key={index} className="grid gap-2">
                      <Label>{index + 1}. {field} *</Label>
                      <RadioGroup
                        value={formData[field]}
                        onValueChange={(value) => handleFieldChange(field, value)}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="APROVADO" id={`${field}-aprovado`} />
                          <Label htmlFor={`${field}-aprovado`} className="cursor-pointer">
                            APROVADO
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="REPROVADO" id={`${field}-reprovado`} />
                          <Label htmlFor={`${field}-reprovado`} className="cursor-pointer">
                            REPROVADO
                          </Label>
                        </div>
                      </RadioGroup>
                      
                      {/* Upload de foto para item reprovado */}
                      {formData[field] === 'REPROVADO' && (
                        <div className="ml-4 mt-2 p-3 bg-muted rounded-md">
                          <Label htmlFor={`photo-${field}`} className="text-sm text-muted-foreground">
                            Foto da Reprovação (opcional)
                          </Label>
                          <Input
                            id={`photo-${field}`}
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              setReprovationPhotos(prev => ({ ...prev, [field]: file }));
                            }}
                            className="mt-1"
                          />
                          {reprovationPhotos[field] && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Arquivo: {reprovationPhotos[field]?.name}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Notes */}
              <div className="grid gap-2">
                <Label htmlFor="notes">Observações e Itens Reprovados</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Descreva os problemas encontrados nos itens reprovados..."
                  rows={4}
                />
              </div>
            </div>

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Registrar Vistoria
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de envio de email */}
      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Relatório por Email</DialogTitle>
            <DialogDescription>
              Digite o email do destinatário para enviar o relatório de {selectedInspections.length} vistoria(s) selecionada(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email do Destinatário</Label>
              <Input
                id="email"
                type="email"
                placeholder="exemplo@email.com"
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsEmailDialogOpen(false);
                setEmailRecipient("");
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={() => sendEmailMutation.mutate({ 
                inspectionIds: selectedInspections, 
                email: emailRecipient 
              })}
              disabled={sendEmailMutation.isPending || !emailRecipient}
            >
              {sendEmailMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta vistoria? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
