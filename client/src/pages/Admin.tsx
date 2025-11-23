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
import { BarChart3, Check, Loader2, Plus, Ship, Trash2, TrendingUp, UserPlus, Users, X } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

function ReportsTab() {
  const { data: stats, isLoading } = trpc.stats.admin.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Reservas</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalBookings || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalClients || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Embarcações</CardTitle>
            <Ship className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalVessels || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próxima Reserva</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {stats?.nextBooking ? (
              <div className="space-y-1">
                <div className="text-lg font-bold">
                  {stats.nextBooking.vesselName}
                  {stats.nextBooking.quotaNumber && ` #${stats.nextBooking.quotaNumber}`}
                </div>
                <div className="text-sm text-muted-foreground">
                  {stats.nextBooking.clientName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(stats.nextBooking.bookingDate).toLocaleDateString('pt-BR', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  })}
                </div>
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">Nenhuma</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Occupancy Rate */}
      <Card>
        <CardHeader>
          <CardTitle>Taxa de Ocupação (30 dias)</CardTitle>
          <CardDescription>Percentual de dias com reservas por embarcação</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats?.occupancyRate.map((vessel, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{vessel.vesselName}</span>
                  <span className="text-muted-foreground">{vessel.rate}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${vessel.rate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Clients */}
      <Card>
        <CardHeader>
          <CardTitle>Top 5 Clientes</CardTitle>
          <CardDescription>Clientes com mais reservas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats?.topClients.map((client, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                    {idx + 1}
                  </div>
                  <span className="font-medium">{client.clientName}</span>
                </div>
                <span className="text-muted-foreground">{client.bookingCount} reservas</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Admin() {
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };
  const utils = trpc.useUtils();

  // Client Management State
  const [showClientDialog, setShowClientDialog] = useState(false);
  const [clientForm, setClientForm] = useState({ 
    email: "", 
    name: "", 
    phone: "",
    quotas: [] as Array<{ vesselId: number, quotaNumber: number, quotaType: "full" | "half" }>
  });

  // Vessel Management State
  const [showVesselDialog, setShowVesselDialog] = useState(false);
  
  // Booking Management State
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    clientEmail: "",
    vesselId: 0,
    bookingDate: "",
    notes: "",
  });
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
      setClientForm({ email: "", name: "", phone: "", quotas: [] });
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

  const updateBookingStatus = trpc.bookings.update.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado!");
      utils.bookings.listAll.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const deleteBooking = trpc.bookings.delete.useMutation({
    onSuccess: () => {
      toast.success("Reserva removida com sucesso!");
      utils.bookings.listAll.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createBookingForClient = trpc.bookings.createForClient.useMutation({
    onSuccess: () => {
      toast.success("Reserva criada com sucesso!");
      setShowBookingDialog(false);
      setBookingForm({ clientEmail: "", vesselId: 0, bookingDate: "", notes: "" });
      utils.bookings.listAll.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreateClient = () => {
    if (!clientForm.email || !clientForm.name || clientForm.quotas.length === 0) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    createClient.mutate(clientForm);
  };

  const handleCreateBooking = () => {
    if (!bookingForm.clientEmail || !bookingForm.vesselId || !bookingForm.bookingDate) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    // Normalizar para meia-noite no fuso horário local
    const [year, month, day] = bookingForm.bookingDate.split('-').map(Number);
    const localDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    const dateTimestamp = localDate.getTime();
    
    createBookingForClient.mutate({
      clientEmail: bookingForm.clientEmail,
      vesselId: bookingForm.vesselId,
      bookingDate: dateTimestamp,
      notes: bookingForm.notes || undefined,
    });
  };

  const handleCreateVessel = () => {
    if (!vesselForm.name || !vesselForm.type) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    createVessel.mutate({
      name: vesselForm.name,
      type: vesselForm.type,
      description: vesselForm.description || undefined,
      capacity: vesselForm.capacity ? parseInt(vesselForm.capacity) : undefined,
    });
  };

  const addQuota = (vesselId: number, quotaNumber: number, quotaType: "full" | "half") => {
    setClientForm({
      ...clientForm,
      quotas: [...clientForm.quotas, { vesselId, quotaNumber, quotaType }]
    });
  };

  const removeQuota = (index: number) => {
    setClientForm({
      ...clientForm,
      quotas: clientForm.quotas.filter((_, i) => i !== index)
    });
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>
              Esta página é acessível apenas para administradores.
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
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <img src={APP_LOGO} alt="Exclusive Club" className="h-10 w-10" />
              <span className="text-lg font-bold text-primary">Exclusive Club Admin</span>
            </Link>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground hidden sm:inline">
                Olá, {user?.name}
              </span>
              <Link href="/reservas">
                <Button variant="outline" size="sm">
                  Minhas Reservas
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" size="sm">
                  Voltar ao Site
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Sair
              </Button>
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
            <TabsTrigger value="reports">
              <BarChart3 className="h-4 w-4 mr-2" />
              Relatórios
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
                          <div className="text-sm font-medium text-primary mt-1">
                            {client.quotas?.map((q: any) => (
                              <span key={q.id} className="mr-2">
                                {vessels?.find(v => v.id === q.vesselId)?.name} #{q.quotaNumber} ({q.quotaType === "full" ? "Inteira" : "Meia"})
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant={client.isActive ? "outline" : "default"}
                            size="sm"
                            onClick={() =>
                              toggleClientStatus.mutate({
                                id: client.id,
                                isActive: !client.isActive,
                              })
                            }
                          >
                            {client.isActive ? "Desativar" : "Ativar"}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (confirm("Tem certeza que deseja remover este cliente?")) {
                                deleteClient.mutate({ id: client.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum cliente cadastrado
                  </p>
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
                  <div className="space-y-2">
                    {vessels.map((vessel) => (
                      <div
                        key={vessel.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="font-semibold">{vessel.name}</div>
                          <div className="text-sm text-muted-foreground capitalize">
                            {vessel.type}
                          </div>
                          {vessel.description && (
                            <div className="text-sm text-muted-foreground">
                              {vessel.description}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm("Tem certeza que deseja remover esta embarcação?")) {
                              deleteVessel.mutate({ id: vessel.id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma embarcação cadastrada
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bookings Tab */}
          <TabsContent value="bookings" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Todas as Reservas</CardTitle>
                  <CardDescription>Gerencie todas as reservas do sistema</CardDescription>
                </div>
                <Button onClick={() => setShowBookingDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Reserva
                </Button>
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
                          <div className="font-semibold">{booking.clientName}</div>
                          <div className="text-sm text-muted-foreground">{booking.clientEmail}</div>
                          <div className="text-sm">
                            {booking.vesselName} -{" "}
                            {new Date(booking.bookingDate).toLocaleDateString("pt-BR")}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              booking.status === "confirmed"
                                ? "bg-green-100 text-green-800"
                                : booking.status === "used"
                                ? "bg-blue-100 text-blue-800"
                                : booking.status === "cancelled"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {booking.status === "confirmed"
                              ? "Confirmada"
                              : booking.status === "used"
                              ? "Utilizada"
                              : booking.status === "cancelled"
                              ? "Cancelada"
                              : "Pendente"}
                          </span>
                          {booking.status === "confirmed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                updateBookingStatus.mutate({
                                  id: booking.id,
                                  status: "used",
                                })
                              }
                            >
                              Marcar como Usada
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (confirm("Tem certeza que deseja remover esta reserva?")) {
                                deleteBooking.mutate({ id: booking.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">Nenhuma reserva encontrada</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-4">
            <ReportsTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Client Dialog */}
      <Dialog open={showClientDialog} onOpenChange={setShowClientDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Cliente</DialogTitle>
            <DialogDescription>Cadastre um novo cliente autorizado</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                placeholder="cliente@example.com"
              />
            </div>
            <div>
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                placeholder="Nome completo"
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
            <div>
              <Label>Cotas *</Label>
              <div className="space-y-2 mt-2">
                {clientForm.quotas.map((quota, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 border rounded">
                    <span className="flex-1 text-sm">
                      {vessels?.find(v => v.id === quota.vesselId)?.name} - Cota #{quota.quotaNumber} ({quota.quotaType === "full" ? "Inteira" : "Meia"})
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeQuota(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                
                <div className="border rounded p-3 space-y-3">
                  <div className="font-medium">Adicionar Cota</div>
                  {vessels?.filter(v => v.isActive).map((vessel) => (
                    <div key={vessel.id} className="space-y-2">
                      <div className="text-sm font-medium">{vessel.name}</div>
                      <div className="grid grid-cols-2 gap-2">
                        {Array.from({ length: vessel.type === "lancha" ? 7 : 6 }, (_, i) => i + 1).map((num) => (
                          <div key={num} className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => addQuota(vessel.id, num, "full")}
                            >
                              #{num} Inteira
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => addQuota(vessel.id, num, "half")}
                            >
                              #{num} Meia
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lancha">Lancha</SelectItem>
                  <SelectItem value="jetski">Jetski</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="vessel-description">Descrição</Label>
              <Textarea
                id="vessel-description"
                value={vesselForm.description}
                onChange={(e) => setVesselForm({ ...vesselForm, description: e.target.value })}
                placeholder="Descrição da embarcação"
              />
            </div>
            <div>
              <Label htmlFor="vessel-capacity">Capacidade</Label>
              <Input
                id="vessel-capacity"
                type="number"
                value={vesselForm.capacity}
                onChange={(e) => setVesselForm({ ...vesselForm, capacity: e.target.value })}
                placeholder="Número de pessoas"
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

      {/* Add Booking Dialog */}
      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar Reserva para Cliente</DialogTitle>
            <DialogDescription>
              Como admin, você pode criar reservas para qualquer cliente sem limite
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="booking-client">Cliente *</Label>
              <Select
                value={bookingForm.clientEmail}
                onValueChange={(value) => setBookingForm({ ...bookingForm, clientEmail: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.email}>
                      {client.name} ({client.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="booking-vessel">Embarcação *</Label>
              <Select
                value={bookingForm.vesselId.toString()}
                onValueChange={(value) => setBookingForm({ ...bookingForm, vesselId: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma embarcação" />
                </SelectTrigger>
                <SelectContent>
                  {vessels?.filter(v => v.isActive).map((vessel) => (
                    <SelectItem key={vessel.id} value={vessel.id.toString()}>
                      {vessel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="booking-date">Data *</Label>
              <Input
                id="booking-date"
                type="date"
                value={bookingForm.bookingDate}
                onChange={(e) => setBookingForm({ ...bookingForm, bookingDate: e.target.value })}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <Label htmlFor="booking-notes">Observações</Label>
              <Textarea
                id="booking-notes"
                value={bookingForm.notes}
                onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
                placeholder="Observações sobre a reserva"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBookingDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateBooking} disabled={createBookingForClient.isPending}>
              {createBookingForClient.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar Reserva"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
