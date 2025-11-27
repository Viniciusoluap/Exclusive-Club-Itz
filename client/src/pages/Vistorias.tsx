import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, ClipboardCheck, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const JET_FIELDS = [
  "PINTURA / CASCO",
  "LUZES GERAL",
  "CARPETE",
  "BANCO E ESTOFADO",
  "ANCORA",
  "COLETES",
  "TURBINA / IBR",
  "CHAVE",
  "CARRETINHA",
  "PNEUS DA CARRETINHA",
  "COLETOR DE AGUA ABAIXO DO CASCO",
  "TAMPA DO JET",
];

const LANCHA_FIELDS = [
  "PINTURA / CASCO",
  "LUZES GERAL",
  "CARPETE",
  "BANCO E ESTOFADO",
  "ANCORA",
  "COLETES",
  "MOTOR",
  "HELICE",
  "CHAVE",
  "CARRETINHA",
  "PNEUS DA CARRETINHA",
  "COLETOR DE AGUA ABAIXO DO CASCO",
  "TAMPA DO MOTOR",
  "PARA-BRISA",
  "TOLDO",
  "ESCADA",
  "EXTINTOR",
  "BUZINA",
  "LIMPADOR DE PARA-BRISA",
  "SISTEMA ELETRICO",
];

export default function Vistorias() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [vesselType, setVesselType] = useState<'jet' | 'lancha' | null>(null);
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [clientName, setClientName] = useState("");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  const trpcAny = trpc as any;
  const { data: recentBookings } = trpcAny.bookings?.getRecent.useQuery({}) || { data: [] }; // Busca todas as reservas
  const { data: inspections, refetch } = trpcAny.inspections?.list.useQuery({}) || { data: [] };
  const { data: vessels } = trpc.vessels.list.useQuery();

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

  const resetForm = () => {
    setSelectedBookingId(null);
    setVesselType(null);
    setInspectionDate(new Date().toISOString().split('T')[0]);
    setClientName("");
    setFormData({});
    setNotes("");
  };

  const handleBookingChange = (bookingId: string) => {
    const id = parseInt(bookingId);
    setSelectedBookingId(id);
    
    const booking = recentBookings?.find((b: any) => b.id === id);
    if (booking) {
      setClientName(booking.clientName);
      
      // Determinar tipo de embarcação
      const vessel = vessels?.find(v => v.id === booking.vesselId);
      if (vessel?.name.toLowerCase().includes('jet')) {
        setVesselType('jet');
      } else {
        setVesselType('lancha');
      }
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
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

    const fields = vesselType === 'jet' ? JET_FIELDS : LANCHA_FIELDS;
    const missingFields = fields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      toast.error(`Preencha todos os campos: ${missingFields.join(', ')}`);
      return;
    }

    createMutation.mutate({
      bookingId: selectedBookingId,
      vesselId: booking.vesselId,
      vesselType,
      inspectionDate: new Date(inspectionDate).getTime(),
      clientName,
      formData,
      notes: notes || undefined,
    });
  };

  const currentFields = vesselType === 'jet' ? JET_FIELDS : vesselType === 'lancha' ? LANCHA_FIELDS : [];

  return (
    <div className="container py-8">
      <div className="mb-6">
        <Link href="/admin">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Vistorias</h1>
            <p className="text-muted-foreground mt-1">
              Registre vistorias das embarcações antes e após o uso
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Vistoria
          </Button>
        </div>
      </div>

      {/* Recent Inspections */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Vistorias Recentes</h2>
        {!inspections || inspections.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma vistoria registrada
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {inspections.map((inspection: any) => {
              const approvedCount = Object.values(inspection.form_data).filter(v => v === 'APROVADO').length;
              const totalFields = Object.keys(inspection.form_data).length;
              const isFullyApproved = approvedCount === totalFields;

              return (
                <Card key={inspection.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <ClipboardCheck className="w-5 h-5 text-primary" />
                        <div>
                          <CardTitle className="text-lg">{inspection.vessel_name}</CardTitle>
                          <CardDescription>
                            {inspection.client_name} • {new Date(inspection.inspection_date).toLocaleDateString('pt-BR')}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="text-right">
                        {isFullyApproved ? (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="font-semibold">Aprovado</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-amber-600">
                            <XCircle className="w-5 h-5" />
                            <span className="font-semibold">Reprovações: {totalFields - approvedCount}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm space-y-2">
                      <p><strong>Tipo:</strong> {inspection.vessel_type === 'jet' ? 'Jet Ski' : 'Lancha'}</p>
                      <p><strong>Vistoriado por:</strong> {inspection.inspected_by_name}</p>
                      {inspection.notes && (
                        <p><strong>Observações:</strong> {inspection.notes}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
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

              {/* Client Name */}
              <div className="grid gap-2">
                <Label htmlFor="clientName">Nome do Cliente *</Label>
                <Input
                  id="clientName"
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nome do cliente que usou"
                  required
                />
              </div>

              {/* Inspection Fields */}
              {vesselType && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold text-lg">
                    Checklist - {vesselType === 'jet' ? 'Jet Ski GTI 130' : 'Focker 215'}
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
    </div>
  );
}
