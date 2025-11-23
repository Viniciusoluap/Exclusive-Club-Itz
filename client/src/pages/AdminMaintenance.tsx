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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Calendar, Loader2, Plus, Settings, Trash2, Edit, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

export default function AdminMaintenance() {
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const [, setLocation] = useLocation();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedMaintenance, setSelectedMaintenance] = useState<any>(null);

  // Form states
  const [vesselId, setVesselId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"scheduled" | "in_progress" | "completed" | "cancelled">("scheduled");

  const utils = trpc.useUtils();

  // Fetch data
  const { data: vessels, isLoading: vesselsLoading } = trpc.vessels.list.useQuery();
  // @ts-ignore - tRPC types will regenerate
  const { data: maintenances, isLoading: maintenancesLoading } = trpc.maintenances.list.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === "admin" }
  );

  // Mutations
  // @ts-ignore
  const createMaintenance = trpc.maintenances.create.useMutation({
    onSuccess: () => {
      toast.success("Manutenção agendada com sucesso!");
      // @ts-ignore
      utils.maintenances.list.invalidate();
      resetForm();
      setShowCreateDialog(false);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  // @ts-ignore
  const updateMaintenance = trpc.maintenances.update.useMutation({
    onSuccess: () => {
      toast.success("Manutenção atualizada com sucesso!");
      // @ts-ignore
      utils.maintenances.list.invalidate();
      setShowEditDialog(false);
      setSelectedMaintenance(null);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  // @ts-ignore
  const deleteMaintenance = trpc.maintenances.delete.useMutation({
    onSuccess: () => {
      toast.success("Manutenção removida com sucesso!");
      // @ts-ignore
      utils.maintenances.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const resetForm = () => {
    setVesselId(null);
    setStartDate("");
    setEndDate("");
    setDescription("");
    setStatus("scheduled");
  };

  const handleCreate = () => {
    if (!vesselId || !startDate || !endDate || !description) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const startTimestamp = new Date(startDate).getTime();
    const endTimestamp = new Date(endDate).getTime();

    if (startTimestamp >= endTimestamp) {
      toast.error("Data de início deve ser anterior à data de término");
      return;
    }

    createMaintenance.mutate({
      vesselId,
      startDate: startTimestamp,
      endDate: endTimestamp,
      description,
    });
  };

  const handleEdit = (maintenance: any) => {
    setSelectedMaintenance(maintenance);
    setVesselId(maintenance.vesselId);
    setStartDate(new Date(maintenance.startDate).toISOString().split("T")[0]);
    setEndDate(new Date(maintenance.endDate).toISOString().split("T")[0]);
    setDescription(maintenance.description);
    setStatus(maintenance.status);
    setShowEditDialog(true);
  };

  const handleUpdate = () => {
    if (!selectedMaintenance) return;

    const updates: any = {
      id: selectedMaintenance.id,
    };

    if (startDate) {
      updates.startDate = new Date(startDate).getTime();
    }
    if (endDate) {
      updates.endDate = new Date(endDate).getTime();
    }
    if (description) {
      updates.description = description;
    }
    if (status) {
      updates.status = status;
    }

    updateMaintenance.mutate(updates);
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja remover esta manutenção?")) {
      deleteMaintenance.mutate({ id });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      scheduled: { variant: "default", label: "Agendada" },
      in_progress: { variant: "secondary", label: "Em Andamento" },
      completed: { variant: "outline", label: "Concluída" },
      cancelled: { variant: "destructive", label: "Cancelada" },
    };

    const config = variants[status] || variants.scheduled;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>Faça login para acessar esta página</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <a href={getLoginUrl()}>Fazer Login</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Acesso Negado
            </CardTitle>
            <CardDescription>Apenas administradores podem acessar esta página</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/">Voltar para Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-white">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-sm shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <img src={APP_LOGO} alt="Exclusive Club" className="h-10 w-10 object-contain" />
              <span className="font-bold text-xl hidden sm:inline">Exclusive Club</span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/" className="text-gray-700 hover:text-cyan-600 transition-colors">
                Home
              </Link>
              <Link href="/embarcacoes" className="text-gray-700 hover:text-cyan-600 transition-colors">
                Embarcações
              </Link>
              <Link href="/galeria" className="text-gray-700 hover:text-cyan-600 transition-colors">
                Galeria
              </Link>
              <Link href="/dashboard" className="text-gray-700 hover:text-cyan-600 transition-colors">
                Dashboard
              </Link>
              <Link href="/sobre" className="text-gray-700 hover:text-cyan-600 transition-colors">
                Sobre Nós
              </Link>
              <Link href="/admin" className="text-gray-700 hover:text-cyan-600 transition-colors">
                Administrador
              </Link>
              <Link href="/reservas">
                <Button size="sm">Minhas Reservas</Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Sair
              </Button>
            </nav>

            {/* Mobile Menu - Simplified */}
            <div className="md:hidden">
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Settings className="h-8 w-8 text-cyan-600" />
              Calendário de Manutenção
            </h1>
            <p className="text-gray-600 mt-2">
              Gerencie períodos de manutenção das embarcações
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Agendar Manutenção
          </Button>
        </div>

        {/* Maintenances List */}
        {maintenancesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : maintenances && maintenances.length > 0 ? (
          <div className="grid gap-4">
            {maintenances.map((maintenance: any) => (
              <Card key={maintenance.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        {maintenance.vesselName}
                        {getStatusBadge(maintenance.status)}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        {maintenance.description}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEdit(maintenance)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDelete(maintenance.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {new Date(maintenance.startDate).toLocaleDateString("pt-BR")} até{" "}
                        {new Date(maintenance.endDate).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">Nenhuma manutenção agendada</p>
              <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Agendar Primeira Manutenção
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar Manutenção</DialogTitle>
            <DialogDescription>
              Bloqueie datas para manutenção de embarcações
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="vessel">Embarcação *</Label>
              <Select value={vesselId?.toString()} onValueChange={(v) => setVesselId(Number(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma embarcação" />
                </SelectTrigger>
                <SelectContent>
                  {vessels?.map((vessel) => (
                    <SelectItem key={vessel.id} value={vessel.id.toString()}>
                      {vessel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="startDate">Data de Início *</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="endDate">Data de Término *</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="description">Descrição *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o tipo de manutenção..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={createMaintenance.isPending}>
              {createMaintenance.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Agendando...
                </>
              ) : (
                "Agendar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Manutenção</DialogTitle>
            <DialogDescription>
              Atualize as informações da manutenção
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="editStartDate">Data de Início</Label>
              <Input
                id="editStartDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="editEndDate">Data de Término</Label>
              <Input
                id="editEndDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="editDescription">Descrição</Label>
              <Textarea
                id="editDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="editStatus">Status</Label>
              <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Agendada</SelectItem>
                  <SelectItem value="in_progress">Em Andamento</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updateMaintenance.isPending}>
              {updateMaintenance.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Atualizando...
                </>
              ) : (
                "Atualizar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
