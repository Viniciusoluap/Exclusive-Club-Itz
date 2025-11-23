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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Check, Loader2, Plus, Ship, Trash2, UserPlus, Users, X, Settings, Mail } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function Admin() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  // Client Management State
  const [showClientDialog, setShowClientDialog] = useState(false);
  const [clientForm, setClientForm] = useState({ email: "", name: "", phone: "" });

  // Vessel Management State
  const [showVesselDialog, setShowVesselDialog] = useState(false);
  const [vesselForm, setVesselForm] = useState({
    name: "",
    type: "lancha" as "lancha" | "jetski",
    description: "",
    capacity: "",
  });

  // Fetch data
  const { data: clients, isLoading: clientsLoading } = trpc.allowedClients.list.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const { data: vessels, isLoading: vesselsLoading } = trpc.vessels.listAll.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const { data: bookings, isLoading: bookingsLoading } = trpc.bookings.listAll.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  // Mutations
  const createClient = trpc.allowedClients.create.useMutation({
    onSuccess: () => {
      toast.success("Cliente adicionado com sucesso!");
      utils.allowedClients.list.invalidate();
      setShowClientDialog(false);
      setClientForm({ email: "", name: "", phone: "" });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteClient = trpc.allowedClients.delete.useMutation({
    onSuccess: () => {
      toast.success("Cliente removido com sucesso!");
      utils.allowedClients.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const toggleClientStatus = trpc.allowedClients.update.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado!");
      utils.allowedClients.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createVessel = trpc.vessels.create.useMutation({
    onSuccess: () => {
      toast.success("Embarcação adicionada com sucesso!");
      utils.vessels.listAll.invalidate();
      setShowVesselDialog(false);
      setVesselForm({ name: "", type: "lancha", description: "", capacity: "" });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteVessel = trpc.vessels.delete.useMutation({
    onSuccess: () => {
      toast.success("Embarcação removida com sucesso!");
      utils.vessels.listAll.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const toggleVesselStatus = trpc.vessels.update.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado!");
      utils.vessels.listAll.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const markAsUsed = trpc.bookings.markAsUsed.useMutation({
    onSuccess: () => {
      toast.success("Reserva marcada como utilizada!");
      utils.bookings.listAll.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteBooking = trpc.bookings.delete.useMutation({
    onSuccess: () => {
      toast.success("Reserva excluída com sucesso!");
      utils.bookings.listAll.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreateClient = () => {
    if (!clientForm.email || !clientForm.name) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    createClient.mutate(clientForm);
  };

  const handleCreateVessel = () => {
    if (!vesselForm.name) {
      toast.error("Preencha o nome da embarcação");
      return;
    }
    createVessel.mutate({
      ...vesselForm,
      capacity: vesselForm.capacity ? parseInt(vesselForm.capacity) : undefined,
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="max-w-md w-full mx-4">
          <CardHeader>
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>
              Apenas administradores podem acessar esta página.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isAuthenticated ? (
              <Button asChild className="w-full">
                <a href={getLoginUrl()}>Fazer Login</a>
              </Button>
            ) : (
              <Link href="/">
                <Button className="w-full">Voltar ao Início</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-background border-b sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/">
              <a className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <img src={APP_LOGO} alt="Exclusive Club" className="h-10 w-10" />
                <span className="text-lg font-bold text-primary">Exclusive Club Admin</span>
              </a>
            </Link>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground hidden sm:inline">
                Admin: {user?.name}
              </span>
              <Link href="/">
                <Button variant="outline" size="sm">
                  Voltar ao Site
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container py-8">
        <Tabs defaultValue="clients" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 max-w-2xl">
            <TabsTrigger value="clients">
              <Users className="h-4 w-4 mr-2" />
              Clientes
            </TabsTrigger>
            <TabsTrigger value="vessels">
              <Ship className="h-4 w-4 mr-2" />
              Embarcações
            </TabsTrigger>
            <TabsTrigger value="bookings">Reservas</TabsTrigger>
            <TabsTrigger value="maintenance">
              <Settings className="h-4 w-4 mr-2" />
              Manutenção
            </TabsTrigger>
          </TabsList>

          {/* Clients Tab */}
          <TabsContent value="clients" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Clientes Autorizados</CardTitle>
                    <CardDescription>
                      Gerencie os emails autorizados a fazer reservas
                    </CardDescription>
                  </div>
                  <Button onClick={() => setShowClientDialog(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Adicionar Cliente
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {clientsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : clients && clients.length > 0 ? (
                  <div className="space-y-2">
                    {clients.map((client) => (
                      <div
                        key={client.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="font-semibold">{client.name}</div>
                          <div className="text-sm text-muted-foreground">{client.email}</div>
                          {client.phone && (
                            <div className="text-sm text-muted-foreground">{client.phone}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant={client.isActive ? "default" : "outline"}
                            size="sm"
                            onClick={() =>
                              toggleClientStatus.mutate({
                                id: client.id,
                                isActive: !client.isActive,
                              })
                            }
                          >
                            {client.isActive ? (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                Ativo
                              </>
                            ) : (
                              <>
                                <X className="h-4 w-4 mr-1" />
                                Inativo
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm("Tem certeza que deseja remover este cliente?")) {
                                deleteClient.mutate({ id: client.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum cliente cadastrado
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Vessels Tab */}
          <TabsContent value="vessels" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Embarcações</CardTitle>
                    <CardDescription>Gerencie as embarcações disponíveis</CardDescription>
                  </div>
                  <Button onClick={() => setShowVesselDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Embarcação
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {vesselsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : vessels && vessels.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {vessels.map((vessel) => (
                      <Card key={vessel.id}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-lg">{vessel.name}</CardTitle>
                              <CardDescription>
                                {vessel.type === "lancha" ? "Lancha" : "Jetski"}
                                {vessel.capacity && ` • ${vessel.capacity} pessoas`}
                              </CardDescription>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm("Tem certeza que deseja remover esta embarcação?")) {
                                  deleteVessel.mutate({ id: vessel.id });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {vessel.description && (
                            <p className="text-sm text-muted-foreground mb-4">
                              {vessel.description}
                            </p>
                          )}
                          <Button
                            variant={vessel.isActive ? "default" : "outline"}
                            size="sm"
                            className="w-full"
                            onClick={() =>
                              toggleVesselStatus.mutate({
                                id: vessel.id,
                                isActive: !vessel.isActive,
                              })
                            }
                          >
                            {vessel.isActive ? "Ativa" : "Inativa"}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma embarcação cadastrada
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bookings Tab */}
          <TabsContent value="bookings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Todas as Reservas</CardTitle>
                <CardDescription>Visualize e gerencie todas as reservas do sistema</CardDescription>
              </CardHeader>
              <CardContent>
                {bookingsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : bookings && bookings.length > 0 ? (
                  <div className="space-y-2">
                    {bookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="font-semibold">{booking.vesselName}</div>
                          <div className="text-sm text-muted-foreground">
                            Cliente: {booking.clientName} ({booking.clientEmail})
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Data:{" "}
                            {new Date(booking.bookingDate).toLocaleDateString("pt-BR", {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </div>
                          {booking.notes && (
                            <div className="text-sm text-muted-foreground mt-1">
                              Obs: {booking.notes}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              booking.status === "confirmed"
                                ? "bg-green-100 text-green-700"
                                : booking.status === "used"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {booking.status === "confirmed"
                              ? "Confirmada"
                              : booking.status === "used"
                              ? "Utilizada"
                              : "Cancelada"}
                          </span>
                          {booking.status === "confirmed" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => markAsUsed.mutate({ id: booking.id })}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Marcar Usada
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm("Tem certeza que deseja excluir esta reserva?")) {
                                    deleteBooking.mutate({ id: booking.id });
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma reserva encontrada
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Maintenance Tab */}
          <TabsContent value="maintenance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Calendário de Manutenção</CardTitle>
                <CardDescription>
                  Gerencie períodos de manutenção das embarcações
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Acesse o calendário completo de manutenção para agendar períodos de bloqueio,
                  visualizar manutenções programadas e gerenciar o status de cada embarcação.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/admin/manutencao">
                    <Button className="w-full sm:w-auto">
                      <Settings className="h-4 w-4 mr-2" />
                      Calendário de Manutenção
                    </Button>
                  </Link>
                  <Link href="/admin/emails">
                    <Button variant="outline" className="w-full sm:w-auto">
                      <Mail className="h-4 w-4 mr-2" />
                      Sistema de Emails
                    </Button>
                  </Link>
                </div>
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">Funcionalidades:</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Agendar períodos de manutenção para cada embarcação</li>
                    <li>• Bloqueio automático de reservas durante manutenção</li>
                    <li>• Acompanhar status: Agendada, Em Andamento, Concluída</li>
                    <li>• Editar ou cancelar manutenções programadas</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Client Dialog */}
      <Dialog open={showClientDialog} onOpenChange={setShowClientDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Cliente Autorizado</DialogTitle>
            <DialogDescription>
              Cadastre um novo email autorizado a fazer reservas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                placeholder="cliente@email.com"
              />
            </div>
            <div>
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                placeholder="Nome do cliente"
              />
            </div>
            <div>
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={clientForm.phone}
                onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                placeholder="(99) 99999-9999"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClientDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateClient} disabled={createClient.isPending}>
              {createClient.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adicionando...
                </>
              ) : (
                "Adicionar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Vessel Dialog */}
      <Dialog open={showVesselDialog} onOpenChange={setShowVesselDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Embarcação</DialogTitle>
            <DialogDescription>Cadastre uma nova embarcação no sistema</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="vessel-name">Nome *</Label>
              <Input
                id="vessel-name"
                value={vesselForm.name}
                onChange={(e) => setVesselForm({ ...vesselForm, name: e.target.value })}
                placeholder="Ex: Jetski Seadoo GTI"
              />
            </div>
            <div>
              <Label htmlFor="vessel-type">Tipo *</Label>
              <Select
                value={vesselForm.type}
                onValueChange={(value: "lancha" | "jetski") =>
                  setVesselForm({ ...vesselForm, type: value })
                }
              >
                <SelectTrigger id="vessel-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lancha">Lancha</SelectItem>
                  <SelectItem value="jetski">Jetski</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="vessel-capacity">Capacidade (pessoas)</Label>
              <Input
                id="vessel-capacity"
                type="number"
                value={vesselForm.capacity}
                onChange={(e) => setVesselForm({ ...vesselForm, capacity: e.target.value })}
                placeholder="Ex: 7"
              />
            </div>
            <div>
              <Label htmlFor="vessel-description">Descrição</Label>
              <Textarea
                id="vessel-description"
                value={vesselForm.description}
                onChange={(e) => setVesselForm({ ...vesselForm, description: e.target.value })}
                placeholder="Descrição da embarcação..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVesselDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateVessel} disabled={createVessel.isPending}>
              {createVessel.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adicionando...
                </>
              ) : (
                "Adicionar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
