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
import { BarChart3, Calendar, Check, ClipboardCheck, CreditCard, DollarSign, Fuel, HardDrive, Loader2, Menu, Pencil, Plus, Settings, Ship, Trash2, TrendingUp, UserCog, UserPlus, Users, X } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import ReportsTab from "@/components/ReportsTab";

function OldReportsTab() {
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
            <CardTitle className="text-sm font-medium">Próximas Reservas</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {stats?.nextBookings && stats.nextBookings.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground mb-2">
                  {new Date(stats.nextBookings[0].bookingDate).toLocaleDateString('pt-BR', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  })}
                </div>
                <div className="space-y-1.5 max-h-24 overflow-y-auto">
                  {stats.nextBookings.map((booking, index) => (
                    <div key={index} className="text-sm">
                      <div className="font-semibold">
                        {booking.vesselName}
                        {booking.quotaNumber && ` #${booking.quotaNumber}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {booking.clientName}
                      </div>
                    </div>
                  ))}
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
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [selectedClientForReport, setSelectedClientForReport] = useState<number | null>(null);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [selectedVesselFilter, setSelectedVesselFilter] = useState<number | "all">("all");
  const [clientForm, setClientForm] = useState<{
    email: string;
    name: string;
    phone: string;
    cpfCnpj?: string;
    contractUrl?: string;
    contract2Url?: string;
    documentUrl?: string;
    quotas: Array<{ vesselId: number, quotaNumber: number, quotaType: "full" | "half" }>;
  }>({ 
    email: "", 
    name: "", 
    phone: "",
    cpfCnpj: "",
    contractUrl: "",
    contract2Url: "",
    documentUrl: "",
    quotas: []
  });

  // Vessel Management State
  const [showVesselDialog, setShowVesselDialog] = useState(false);
  const [editingVessel, setEditingVessel] = useState<any>(null);
  const [editingVesselId, setEditingVesselId] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [editingQuotaVesselId, setEditingQuotaVesselId] = useState<number | null>(null);
  
  // Booking Management State
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [bookingTimeFilter, setBookingTimeFilter] = useState<"future" | "past">("future");
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
    quotaCount: "6",
    documentUrl: "",
    extraDocumentUrl: "",
  });

  // Fetch data
  const { data: clients, isLoading: clientsLoading } = trpc.allowedClients.list.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const { data: vessels, isLoading: vesselsLoading } = trpc.vessels.listAll.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const { data: bookings, isLoading: bookingsLoading } = trpc.bookings.listAll.useQuery(
    { timeFilter: bookingTimeFilter },
    {
      enabled: isAuthenticated && user?.role === "admin",
    }
  );

  // Mutations
  const createClient = trpc.allowedClients.create.useMutation({
    onSuccess: () => {
      toast.success("Cliente adicionado com sucesso!");
      utils.allowedClients.list.invalidate();
      setShowClientDialog(false);
      setEditingClientId(null);
      setClientForm({ email: "", name: "", phone: "", contractUrl: "", contract2Url: "", documentUrl: "", quotas: [] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateClient = trpc.allowedClients.update.useMutation({
    onSuccess: () => {
      toast.success("Cliente atualizado com sucesso!");
      utils.allowedClients.list.invalidate();
      setShowClientDialog(false);
      setEditingClientId(null);
      setClientForm({ email: "", name: "", phone: "", contractUrl: "", contract2Url: "", documentUrl: "", quotas: [] });
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

  const generateReport = trpc.allowedClients.generateReport.useMutation();

  const deleteDocumentMutation = trpc.allowedClients.deleteDocument.useMutation({
    onSuccess: () => {
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
      setEditingVesselId(null);
      setVesselForm({ name: "", type: "lancha", description: "", capacity: "", quotaCount: "6", documentUrl: "", extraDocumentUrl: "" });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateVessel = trpc.vessels.update.useMutation({
    onSuccess: () => {
      toast.success("Embarcação atualizada com sucesso!");
      utils.vessels.listAll.invalidate();
      setShowVesselDialog(false);
      setEditingVesselId(null);
      setVesselForm({ name: "", type: "lancha", description: "", capacity: "", quotaCount: "6", documentUrl: "", extraDocumentUrl: "" });
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

  const updateDocumentsMutation = trpc.vessels.updateDocuments.useMutation({
    onSuccess: () => {
      toast.success("Documentos atualizados com sucesso!");
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
    if (!clientForm.email || !clientForm.name) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (editingClientId) {
      updateClient.mutate({ id: editingClientId, ...clientForm });
    } else {
      createClient.mutate(clientForm);
    }
  };

  const handleEditClient = (client: any) => {
    setEditingClientId(client.id);
    setClientForm({
      email: client.email,
      name: client.name,
      phone: client.phone || "",
      cpfCnpj: client.cpfCnpj || "",
      contractUrl: client.contractUrl || "",
      contract2Url: client.contract2Url || "",
      documentUrl: client.documentUrl || "",
      quotas: client.quotas || [],
    });
    setShowClientDialog(true);
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

    // Validar documento obrigatório
    if (!editingVesselId && !vesselForm.documentUrl) {
      toast.error("Documento da embarcação é obrigatório");
      return;
    }

    const quotaCountNum = parseInt(vesselForm.quotaCount);
    if (isNaN(quotaCountNum) || quotaCountNum < 1 || quotaCountNum > 10) {
      toast.error("Quantidade de cotas deve ser entre 1 e 10");
      return;
    }
    
    if (editingVesselId) {
      // Atualizar embarcação existente
      updateVessel.mutate({
        id: editingVesselId,
        name: vesselForm.name,
        type: vesselForm.type,
        description: vesselForm.description || undefined,
        capacity: vesselForm.capacity ? parseInt(vesselForm.capacity) : undefined,
        quotaCount: quotaCountNum,
      } as any);
      
      // Atualizar documentos separadamente se houver mudanças
      if (vesselForm.documentUrl || vesselForm.extraDocumentUrl) {
        updateDocumentsMutation.mutate({
          id: editingVesselId,
          documentUrl: vesselForm.documentUrl || undefined,
          extraDocumentUrl: vesselForm.extraDocumentUrl || undefined,
        });
      }
    } else {
      // Criar nova embarcação
      createVessel.mutate({
        name: vesselForm.name,
        type: vesselForm.type,
        description: vesselForm.description || undefined,
        capacity: vesselForm.capacity ? parseInt(vesselForm.capacity) : undefined,
        quotaCount: quotaCountNum,
        documentUrl: vesselForm.documentUrl,
        extraDocumentUrl: vesselForm.extraDocumentUrl || undefined,
      } as any);
    }
  };

  const handleEditVessel = (vessel: any) => {
    setEditingVesselId(vessel.id);
    setVesselForm({
      name: vessel.name,
      type: vessel.type,
      description: vessel.description || "",
      capacity: vessel.capacity ? vessel.capacity.toString() : "",
      quotaCount: vessel.quotaCount ? vessel.quotaCount.toString() : "6",
      documentUrl: vessel.documentUrl || "",
      extraDocumentUrl: vessel.extraDocumentUrl || "",
    });
    setShowVesselDialog(true);
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
              <img src={APP_LOGO} alt="Exclusive Club" className="h-10 w-10" style={{width: '70px', height: '65px', backgroundColor: '#1aacea', borderRadius: '8px', padding: '4px'}} />
              <span className="text-lg font-bold text-primary">Exclusive Club Admin</span>
            </Link>
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                Olá, {user?.name}
              </span>
              <Link href="/admin/configuracoes">
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Configurações
                </Button>
              </Link>
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

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-background border-b shadow-lg">
          <div className="container px-4 py-4 space-y-2">
            <div className="text-sm text-muted-foreground mb-3">
              Olá, {user?.name}
            </div>
            <Link href="/admin/configuracoes" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start">
                <Settings className="h-4 w-4 mr-2" />
                Configurações
              </Button>
            </Link>
            <Link href="/reservas" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start">
                <Calendar className="h-4 w-4 mr-2" />
                Minhas Reservas
              </Button>
            </Link>
            <Link href="/" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start">
                Voltar ao Site
              </Button>
            </Link>
            <Button 
              variant="ghost" 
              className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => {
                setMobileMenuOpen(false);
                handleLogout();
              }}
            >
              Sair
            </Button>
          </div>
        </div>
      )}

      <div className="container py-8">
        <Tabs defaultValue="clients" className="space-y-6">
          <TabsList className="w-full grid grid-cols-4 md:grid-cols-8 gap-2 p-1 max-w-full md:max-w-full">
            <TabsTrigger value="clients" className="flex flex-col md:flex-row items-center justify-center py-3 md:py-1.5">
              <Users className="h-6 w-6 md:h-4 md:w-4 md:mr-2" />
              <span className="hidden md:inline">Clientes</span>
            </TabsTrigger>
            <TabsTrigger value="vessels" className="flex flex-col md:flex-row items-center justify-center py-3 md:py-1.5">
              <Ship className="h-6 w-6 md:h-4 md:w-4 md:mr-2" />
              <span className="hidden md:inline">Embarcações</span>
            </TabsTrigger>
            <TabsTrigger value="bookings" className="flex flex-col md:flex-row items-center justify-center py-3 md:py-1.5">
              <Calendar className="h-6 w-6 md:h-4 md:w-4 md:mr-2" />
              <span className="hidden md:inline">Reservas</span>
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="flex flex-col md:flex-row items-center justify-center py-3 md:py-1.5">
              <Settings className="h-6 w-6 md:h-4 md:w-4 md:mr-2" />
              <span className="hidden md:inline">Manutenção</span>
            </TabsTrigger>
            <TabsTrigger value="employees" className="flex flex-col md:flex-row items-center justify-center py-3 md:py-1.5">
              <UserCog className="h-6 w-6 md:h-4 md:w-4 md:mr-2" />
              <span className="hidden md:inline">Funcionários</span>
            </TabsTrigger>
            <TabsTrigger value="fuel" className="flex flex-col md:flex-row items-center justify-center py-3 md:py-1.5">
              <Fuel className="h-6 w-6 md:h-4 md:w-4 md:mr-2" />
              <span className="hidden md:inline">Abastecimento</span>
            </TabsTrigger>
            <TabsTrigger value="inspections" className="flex flex-col md:flex-row items-center justify-center py-3 md:py-1.5">
              <ClipboardCheck className="h-6 w-6 md:h-4 md:w-4 md:mr-2" />
              <span className="hidden md:inline">Vistorias</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex flex-col md:flex-row items-center justify-center py-3 md:py-1.5">
              <BarChart3 className="h-6 w-6 md:h-4 md:w-4 md:mr-2" />
              <span className="hidden md:inline">Relatórios</span>
            </TabsTrigger>
            <TabsTrigger value="saas" className="flex flex-col md:flex-row items-center justify-center py-3 md:py-1.5">
              <DollarSign className="h-6 w-6 md:h-4 md:w-4 md:mr-2" />
              <span className="hidden md:inline">Saas</span>
            </TabsTrigger>
          </TabsList>

          {/* Clients Tab */}
          <TabsContent value="clients" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <CardTitle>Clientes Autorizados</CardTitle>
                    <CardDescription>
                      Gerencie os emails autorizados a fazer reservas
                    </CardDescription>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    <Button 
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        if (!clients || clients.length === 0) {
                          toast.error('Nenhum cliente cadastrado');
                          return;
                        }
                        setShowReportDialog(true);
                      }}
                    >
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      Gerar Relatório PDF
                    </Button>
                    <Button onClick={() => setShowClientDialog(true)} className="w-full sm:w-auto">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Adicionar Cliente
                    </Button>
                  </div>
                </div>
                {/* Filtro de Embarcação */}
                <div className="flex items-center gap-2 mt-4">
                  <Label htmlFor="vessel-filter" className="text-sm font-medium whitespace-nowrap">
                    Filtrar por embarcação:
                  </Label>
                  <Select
                    value={selectedVesselFilter.toString()}
                    onValueChange={(value) => setSelectedVesselFilter(value === "all" ? "all" : parseInt(value))}
                  >
                    <SelectTrigger id="vessel-filter" className="w-[280px]">
                      <SelectValue placeholder="Selecione uma embarcação" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as embarcações</SelectItem>
                      {vessels?.map((vessel) => (
                        <SelectItem key={vessel.id} value={vessel.id.toString()}>
                          {vessel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {clientsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : clients && clients.length > 0 ? (
                  <div className="space-y-2">
                    {(() => {
                      // Filtrar clientes por embarcação selecionada
                      let filteredClients = clients;
                      if (selectedVesselFilter !== "all") {
                        filteredClients = clients.filter(client => 
                          client.quotas?.some((q: any) => q.vesselId === selectedVesselFilter)
                        );
                      }

                      // Ordenar por cotas sequenciais: #1 Inteira → #1 Meia → #2 Inteira → #2 Meia...
                      const sortedClients = [...filteredClients].sort((a, b) => {
                        // Pegar a primeira cota de cada cliente para ordenação
                        const aQuota = a.quotas?.[0];
                        const bQuota = b.quotas?.[0];
                        
                        if (!aQuota || !bQuota) return 0;
                        
                        // Se estiver filtrando por embarcação, usar apenas cotas dessa embarcação
                        const aRelevantQuota = selectedVesselFilter !== "all" 
                          ? a.quotas?.find((q: any) => q.vesselId === selectedVesselFilter) || aQuota
                          : aQuota;
                        const bRelevantQuota = selectedVesselFilter !== "all"
                          ? b.quotas?.find((q: any) => q.vesselId === selectedVesselFilter) || bQuota
                          : bQuota;
                        
                        // Primeiro ordenar por número da cota
                        if (aRelevantQuota.quotaNumber !== bRelevantQuota.quotaNumber) {
                          return aRelevantQuota.quotaNumber - bRelevantQuota.quotaNumber;
                        }
                        
                        // Se número igual, ordenar por tipo (full antes de half)
                        // "full" = Inteira (vem primeiro), "half" = Meia (vem depois)
                        if (aRelevantQuota.quotaType === "full" && bRelevantQuota.quotaType === "half") {
                          return -1;
                        }
                        if (aRelevantQuota.quotaType === "half" && bRelevantQuota.quotaType === "full") {
                          return 1;
                        }
                        
                        return 0;
                      });

                      if (sortedClients.length === 0) {
                        return (
                          <p className="text-center text-muted-foreground py-8">
                            Nenhum cliente encontrado para esta embarcação
                          </p>
                        );
                      }

                      return sortedClients.map((client) => (
                      <div
                        key={client.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-semibold">{client.name}</div>
                            {(!client.quotas || client.quotas.length === 0) && (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                                SEM COTAS
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">{client.email}</div>
                          {client.phone && (
                            <div className="text-sm text-muted-foreground">{client.phone}</div>
                          )}
                          {client.quotas && client.quotas.length > 0 && (
                            <div className="text-sm font-medium text-primary mt-1">
                              {client.quotas.map((q: any) => (
                                <span key={q.id} className="mr-2">
                                  {vessels?.find(v => v.id === q.vesselId)?.name} #{q.quotaNumber} ({q.quotaType === "full" ? "Inteira" : "Meia"})
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditClient(client)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
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
                      ));
                    })()}
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
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditVessel(vessel)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
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
              <CardHeader className="space-y-4">
                <div className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Todas as Reservas</CardTitle>
                    <CardDescription>Gerencie todas as reservas do sistema</CardDescription>
                  </div>
                  <Button onClick={() => setShowBookingDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Reserva
                  </Button>
                </div>
                
                {/* Filtro de tempo */}
                <div className="flex items-center gap-2">
                  <Button
                    variant={bookingTimeFilter === "future" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setBookingTimeFilter("future")}
                  >
                    📅 Futuras
                  </Button>
                  <Button
                    variant={bookingTimeFilter === "past" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setBookingTimeFilter("past")}
                  >
                    📜 Reservas Passadas
                  </Button>
                </div>
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
                          {booking.status === "confirmed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-orange-600 hover:text-orange-700 border-orange-300"
                              onClick={() => {
                                if (confirm("Tem certeza que deseja cancelar esta reserva?")) {
                                  updateBookingStatus.mutate({
                                    id: booking.id,
                                    status: "cancelled",
                                  });
                                }
                              }}
                            >
                              <X className="h-4 w-4" />
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

          {/* Maintenance Tab */}
          <TabsContent value="maintenance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Calendário de Manutenção</CardTitle>
                <CardDescription>
                  Gerencie os períodos de manutenção das embarcações. Reservas são bloqueadas automaticamente durante estes períodos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Settings className="h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground text-center">
                    Acesse a página completa de manutenção para gerenciar os períodos
                  </p>
                  <Button asChild>
                    <Link href="/admin/manutencao">
                      <Calendar className="h-4 w-4 mr-2" />
                      Abrir Calendário de Manutenção
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Inspections Tab */}
          <TabsContent value="inspections" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Vistorias</CardTitle>
                  <CardDescription>
                    Registre vistorias das embarcações antes e após o uso e visualize o histórico.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-center">
                    <Button asChild>
                      <Link href="/admin/vistorias">
                        <ClipboardCheck className="h-4 w-4 mr-2" />
                        Gerenciar Vistorias
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Cobranças de Danos</CardTitle>
                  <CardDescription>
                    Gerencie cobranças de reparos após vistorias reprovadas.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-center">
                    <Button asChild variant="outline">
                      <Link href="/admin/cobrancas-danos">
                        <DollarSign className="h-4 w-4 mr-2" />
                        Gerenciar Cobranças
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Fuel Tab */}
          <TabsContent value="fuel" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Abastecimento</CardTitle>
                <CardDescription>
                  Registre o abastecimento das embarcações após o uso e visualize relatórios de consumo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-center">
                  <Button asChild>
                    <Link href="/admin/abastecimento">
                      <Fuel className="h-4 w-4 mr-2" />
                      Gerenciar Abastecimento
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Employees Tab */}
          <TabsContent value="employees" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Funcionários</CardTitle>
                <CardDescription>
                  Gerencie funcionários com acesso limitado ao sistema (apenas reservas futuras, manutenções e relatórios).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-center">
                  <Button asChild>
                    <Link href="/admin/funcionarios">
                      <UserCog className="h-4 w-4 mr-2" />
                      Gerenciar Funcionários
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-4">
            <ReportsTab />
          </TabsContent>

          {/* Saas Tab */}
          <TabsContent value="saas" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Saas - Mensalidades</CardTitle>
                <CardDescription>Acesse a página completa de gestão de mensalidades</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/admin/saas">
                  <Button className="w-full">
                    <DollarSign className="h-4 w-4 mr-2" />
                    Acessar Saas
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Client Dialog */}
      <Dialog open={showClientDialog} onOpenChange={(open) => {
        setShowClientDialog(open);
        if (!open) {
          setEditingClientId(null);
          setClientForm({ email: "", name: "", phone: "", contractUrl: "", contract2Url: "", documentUrl: "", quotas: [] });
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClientId ? "Editar Cliente" : "Adicionar Cliente"}</DialogTitle>
            <DialogDescription>
              {editingClientId ? "Atualize os dados do cliente" : "Cadastre um novo cliente autorizado"}
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
              <Label htmlFor="cpfCnpj">CPF ou CNPJ</Label>
              <Input
                id="cpfCnpj"
                value={clientForm.cpfCnpj || ""}
                onChange={(e) => setClientForm({ ...clientForm, cpfCnpj: e.target.value })}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Obrigatório para gerar cobranças de reparos
              </p>
            </div>
            
            {/* Campos de Upload de Documentos */}
            <div className="border-t pt-4 space-y-4">
              <div className="font-medium text-sm">Documentos do Cliente</div>
              
              {/* Contrato Principal (Obrigatório) */}
              <div>
                <Label htmlFor="contract">Contrato do Cliente *</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="contract"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      if (!editingClientId) {
                        toast.error("Salve o cliente primeiro antes de fazer upload de documentos");
                        return;
                      }
                      
                      const formData = new FormData();
                      formData.append('file', file);
                      formData.append('clientId', editingClientId.toString());
                      formData.append('documentType', 'contract');
                      
                      try {
                        const response = await fetch('/api/upload-client-document', {
                          method: 'POST',
                          body: formData,
                        });
                        
                        if (!response.ok) throw new Error('Erro ao fazer upload');
                        
                        const data = await response.json();
                        setClientForm({ ...clientForm, contractUrl: data.url });
                        toast.success('Contrato enviado com sucesso!');
                      } catch (error) {
                        toast.error('Erro ao fazer upload do contrato');
                      }
                    }}
                  />
                  {clientForm.contractUrl && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(clientForm.contractUrl, '_blank')}
                      >
                        Ver
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!editingClientId) return;
                          
                          if (!confirm('Tem certeza que deseja excluir este documento?')) return;
                          
                          try {
                            await deleteDocumentMutation.mutateAsync({
                              clientId: editingClientId,
                              documentType: 'contract',
                            });
                            setClientForm({ ...clientForm, contractUrl: undefined });
                            toast.success('Documento excluído com sucesso!');
                          } catch (error) {
                            toast.error('Erro ao excluir documento');
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Contrato 2 (Opcional) */}
              <div>
                <Label htmlFor="contract2">Contrato 2 do Cliente (opcional)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="contract2"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      if (!editingClientId) {
                        toast.error("Salve o cliente primeiro antes de fazer upload de documentos");
                        return;
                      }
                      
                      const formData = new FormData();
                      formData.append('file', file);
                      formData.append('clientId', editingClientId.toString());
                      formData.append('documentType', 'contract2');
                      
                      try {
                        const response = await fetch('/api/upload-client-document', {
                          method: 'POST',
                          body: formData,
                        });
                        
                        if (!response.ok) throw new Error('Erro ao fazer upload');
                        
                        const data = await response.json();
                        setClientForm({ ...clientForm, contract2Url: data.url });
                        toast.success('Contrato 2 enviado com sucesso!');
                      } catch (error) {
                        toast.error('Erro ao fazer upload do contrato 2');
                      }
                    }}
                  />
                  {clientForm.contract2Url && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(clientForm.contract2Url, '_blank')}
                      >
                        Ver
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!editingClientId) return;
                          
                          if (!confirm('Tem certeza que deseja excluir este documento?')) return;
                          
                          try {
                            await deleteDocumentMutation.mutateAsync({
                              clientId: editingClientId,
                              documentType: 'contract2',
                            });
                            setClientForm({ ...clientForm, contract2Url: undefined });
                            toast.success('Documento excluído com sucesso!');
                          } catch (error) {
                            toast.error('Erro ao excluir documento');
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Documento Pessoal (Obrigatório) */}
              <div>
                <Label htmlFor="document">Documento Pessoal *</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="document"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      if (!editingClientId) {
                        toast.error("Salve o cliente primeiro antes de fazer upload de documentos");
                        return;
                      }
                      
                      const formData = new FormData();
                      formData.append('file', file);
                      formData.append('clientId', editingClientId.toString());
                      formData.append('documentType', 'document');
                      
                      try {
                        const response = await fetch('/api/upload-client-document', {
                          method: 'POST',
                          body: formData,
                        });
                        
                        if (!response.ok) throw new Error('Erro ao fazer upload');
                        
                        const data = await response.json();
                        setClientForm({ ...clientForm, documentUrl: data.url });
                        toast.success('Documento enviado com sucesso!');
                      } catch (error) {
                        toast.error('Erro ao fazer upload do documento');
                      }
                    }}
                  />
                  {clientForm.documentUrl && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(clientForm.documentUrl, '_blank')}
                      >
                        Ver
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!editingClientId) return;
                          
                          if (!confirm('Tem certeza que deseja excluir este documento?')) return;
                          
                          try {
                            await deleteDocumentMutation.mutateAsync({
                              clientId: editingClientId,
                              documentType: 'document',
                            });
                            setClientForm({ ...clientForm, documentUrl: undefined });
                            toast.success('Documento excluído com sucesso!');
                          } catch (error) {
                            toast.error('Erro ao excluir documento');
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div>
              <Label>Cotas</Label>
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
                        {/* @ts-ignore */}
                        {Array.from({ length: vessel.quotaCount || 6 }, (_, i) => i + 1).map((num) => (
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
            <Button onClick={handleCreateClient} disabled={createClient.isPending || updateClient.isPending}>
              {(createClient.isPending || updateClient.isPending) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {editingClientId ? "Atualizando..." : "Adicionando..."}
                </>
              ) : (
                editingClientId ? "Atualizar" : "Adicionar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Dialog - Selecionar Cliente para Gerar Relatório */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Relatório PDF</DialogTitle>
            <DialogDescription>
              Selecione um cliente para gerar o relatório completo com documentos
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Cliente</Label>
            <Select
              value={selectedClientForReport?.toString() || ""}
              onValueChange={(value) => setSelectedClientForReport(parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients?.map((client) => (
                  <SelectItem key={client.id} value={client.id.toString()}>
                    {client.name} ({client.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowReportDialog(false);
              setSelectedClientForReport(null);
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={async () => {
                if (!selectedClientForReport) {
                  toast.error('Selecione um cliente');
                  return;
                }
                
                try {
                  const result = await generateReport.mutateAsync({ 
                    clientId: selectedClientForReport 
                  });
                  
                  // Converter base64 para Blob
                  const byteCharacters = atob(result.pdf);
                  const byteNumbers = new Array(byteCharacters.length);
                  for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                  }
                  const byteArray = new Uint8Array(byteNumbers);
                  const blob = new Blob([byteArray], { type: 'application/pdf' });
                  
                  // Criar URL e fazer download
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = result.filename;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                  
                  toast.success('Relatório gerado com sucesso!');
                  setShowReportDialog(false);
                  setSelectedClientForReport(null);
                } catch (error: any) {
                  toast.error(error.message || 'Erro ao gerar relatório');
                }
              }}
              disabled={!selectedClientForReport || generateReport.isPending}
            >
              {generateReport.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                'Gerar Relatório'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Vessel Dialog */}
      <Dialog open={showVesselDialog} onOpenChange={(open) => {
        setShowVesselDialog(open);
        if (!open) {
          setEditingVesselId(null);
          setVesselForm({ name: "", type: "lancha", description: "", capacity: "", quotaCount: "6", documentUrl: "", extraDocumentUrl: "" });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVesselId ? "Editar Embarcação" : "Adicionar Embarcação"}</DialogTitle>
            <DialogDescription>
              {editingVesselId ? "Atualize as informações da embarcação" : "Cadastre uma nova embarcação no sistema"}
            </DialogDescription>
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
            <div>
              <Label htmlFor="vessel-quota-count">Quantidade de Cotas *</Label>
              <Input
                id="vessel-quota-count"
                type="number"
                min="1"
                max="10"
                value={vesselForm.quotaCount}
                onChange={(e) => setVesselForm({ ...vesselForm, quotaCount: e.target.value })}
                placeholder="Ex: 3, 4, 6, 7"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Número de cotas disponíveis para esta embarcação
              </p>
            </div>

            {/* Documento da Embarcação */}
            <div>
              <Label htmlFor="vessel-document">📄 Documento da Embarcação *</Label>
              <Input
                id="vessel-document"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 10 * 1024 * 1024) {
                      toast.error("Arquivo muito grande. Máximo: 10 MB");
                      return;
                    }
                    const formData = new FormData();
                    formData.append("file", file);
                    try {
                      const response = await fetch("/api/upload", {
                        method: "POST",
                        body: formData,
                      });
                      const data = await response.json();
                      if (data.url) {
                        setVesselForm({ ...vesselForm, documentUrl: data.url });
                        toast.success("Documento enviado com sucesso!");
                      }
                    } catch (error) {
                      toast.error("Erro ao enviar documento");
                    }
                  }
                }}
              />
              {vesselForm.documentUrl && (
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(vesselForm.documentUrl, "_blank")}
                  >
                    👁️ Ver
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm("Tem certeza que deseja excluir este documento?")) {
                        setVesselForm({ ...vesselForm, documentUrl: "" });
                        toast.success("Documento removido");
                      }
                    }}
                  >
                    🗑️ Excluir
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                PDF, JPG ou PNG (máx 10 MB)
              </p>
            </div>

            {/* Documento Extra */}
            <div>
              <Label htmlFor="vessel-extra-document">📎 Documento Extra (opcional)</Label>
              <Input
                id="vessel-extra-document"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 10 * 1024 * 1024) {
                      toast.error("Arquivo muito grande. Máximo: 10 MB");
                      return;
                    }
                    const formData = new FormData();
                    formData.append("file", file);
                    try {
                      const response = await fetch("/api/upload", {
                        method: "POST",
                        body: formData,
                      });
                      const data = await response.json();
                      if (data.url) {
                        setVesselForm({ ...vesselForm, extraDocumentUrl: data.url });
                        toast.success("Documento extra enviado com sucesso!");
                      }
                    } catch (error) {
                      toast.error("Erro ao enviar documento extra");
                    }
                  }
                }}
              />
              {vesselForm.extraDocumentUrl && (
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(vesselForm.extraDocumentUrl, "_blank")}
                  >
                    👁️ Ver
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm("Tem certeza que deseja excluir este documento?")) {
                        setVesselForm({ ...vesselForm, extraDocumentUrl: "" });
                        toast.success("Documento extra removido");
                      }
                    }}
                  >
                    🗑️ Excluir
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                PDF, JPG ou PNG (máx 10 MB)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVesselDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateVessel} disabled={createVessel.isPending || updateVessel.isPending}>
              {(createVessel.isPending || updateVessel.isPending) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {editingVesselId ? "Atualizando..." : "Adicionando..."}
                </>
              ) : (
                editingVesselId ? "Atualizar" : "Adicionar"
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
