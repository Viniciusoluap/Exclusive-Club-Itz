import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, Fuel, TrendingUp, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Abastecimento() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [liters, setLiters] = useState("");
  const [pricePerLiter, setPricePerLiter] = useState("");
  const [notes, setNotes] = useState("");

  const trpcAny = trpc as any;
  const { data: recentBookings } = trpcAny.bookings?.getRecent.useQuery({ includeUsed: true }) || { data: [] }; // Busca todas as reservas incluindo usadas
  const { data: fuelRecords, refetch } = trpcAny.fuelRecords?.list.useQuery({}) || { data: [] };
  const { data: vessels } = trpc.vessels.list.useQuery();

  const createMutation = trpcAny.fuelRecords?.create.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Abastecimento registrado! Valor total: R$ ${data.totalCost.toFixed(2)}`);
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao registrar abastecimento: ${error.message}`);
    },
  });

  const resetForm = () => {
    setSelectedBookingId(null);
    setLiters("");
    setPricePerLiter("");
    setNotes("");
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedBookingId) {
      toast.error("Selecione uma reserva");
      return;
    }

    const booking = recentBookings?.find((b: any) => b.id === selectedBookingId);
    if (!booking) {
      toast.error("Reserva não encontrada");
      return;
    }

    createMutation.mutate({
      bookingId: selectedBookingId,
      vesselId: booking.vesselId,
      liters: parseFloat(liters),
      pricePerLiter: parseFloat(pricePerLiter),
      notes: notes || undefined,
    });
  };

  const SERVICE_FEE = 10.00; // Taxa de abastecimento e aplicativo
  
  const subtotal = liters && pricePerLiter 
    ? parseFloat(liters) * parseFloat(pricePerLiter)
    : 0;
  
  const totalCost = liters && pricePerLiter
    ? (subtotal + SERVICE_FEE).toFixed(2)
    : "0.00";

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
            <h1 className="text-3xl font-bold">Abastecimento</h1>
            <p className="text-muted-foreground mt-1">
              Registre o abastecimento das embarcações após o uso
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Registrar Abastecimento
          </Button>
        </div>
      </div>

      {/* Recent Fuel Records */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Registros Recentes</h2>
        {!fuelRecords || fuelRecords.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum registro de abastecimento encontrado
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {fuelRecords.map((record: any) => (
              <Card key={record.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Fuel className="w-5 h-5 text-primary" />
                      <div>
                        <CardTitle className="text-lg">{record.vessel_name}</CardTitle>
                        <CardDescription>
                          {record.client_name} • {new Date(record.booking_date).toLocaleDateString('pt-BR')}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        R$ {Number(record.total_cost).toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>{Number(record.liters).toFixed(1)}L × R$ {Number(record.price_per_liter).toFixed(2)} = R$ {(Number(record.liters) * Number(record.price_per_liter)).toFixed(2)}</div>
                        <div>Taxa: R$ 10,00</div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                {record.notes && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      <strong>Observações:</strong> {record.notes}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Registrado por: {record.recorded_by_name} • {new Date(record.recorded_at).toLocaleString('pt-BR')}
                    </p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Registrar Abastecimento</DialogTitle>
              <DialogDescription>
                Registre o abastecimento após a vistoria da embarcação
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="booking">Reserva *</Label>
                <Select 
                  value={selectedBookingId?.toString()} 
                  onValueChange={(value) => setSelectedBookingId(parseInt(value))}
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

              <div className="grid gap-2">
                <Label htmlFor="liters">Litros Abastecidos *</Label>
                <Input
                  id="liters"
                  type="number"
                  step="0.1"
                  min="0"
                  value={liters}
                  onChange={(e) => setLiters(e.target.value)}
                  placeholder="Ex: 25.5"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="pricePerLiter">Preço por Litro (R$) *</Label>
                <Input
                  id="pricePerLiter"
                  type="number"
                  step="0.01"
                  min="0"
                  value={pricePerLiter}
                  onChange={(e) => setPricePerLiter(e.target.value)}
                  placeholder="Ex: 6.50"
                  required
                />
              </div>

              {liters && pricePerLiter && (
                <div className="p-4 bg-primary/10 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Combustível ({liters}L × R$ {parseFloat(pricePerLiter).toFixed(2)}):</span>
                    <span className="font-medium">R$ {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Taxa de Abastecimento e Aplicativo:</span>
                    <span className="font-medium">R$ {SERVICE_FEE.toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-2 flex items-center justify-between">
                    <span className="font-semibold">Valor Total:</span>
                    <span className="text-2xl font-bold text-primary">R$ {totalCost}</span>
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Tanque estava pela metade"
                  rows={3}
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
                Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
