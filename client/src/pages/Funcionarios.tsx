import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, UserCog } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export default function Funcionarios() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  const trpcAny = trpc as any;
  const { data: employees, isLoading, refetch } = trpcAny.employees?.list.useQuery() || { data: undefined, isLoading: true, refetch: () => {} };
  const { data: vessels } = trpc.vessels.list.useQuery();
  
  const createMutation = trpcAny.employees.create.useMutation({
    onSuccess: () => {
      toast.success("Funcionário cadastrado com sucesso!");
      setIsCreateDialogOpen(false);
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao cadastrar funcionário: ${error.message}`);
    },
  });

  const updateMutation = trpcAny.employees.update.useMutation({
    onSuccess: () => {
      toast.success("Funcionário atualizado com sucesso!");
      setIsEditDialogOpen(false);
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao atualizar funcionário: ${error.message}`);
    },
  });

  const deleteMutation = trpcAny.employees.delete.useMutation({
    onSuccess: () => {
      toast.success("Funcionário desativado com sucesso!");
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao desativar funcionário: ${error.message}`);
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const vesselIds: number[] = [];
    
    vessels?.forEach((vessel) => {
      if (formData.get(`vessel_${vessel.id}`) === 'on') {
        vesselIds.push(vessel.id);
      }
    });

    createMutation.mutate({
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string || undefined,
      vesselIds: vesselIds.length > 0 ? vesselIds : undefined,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    const formData = new FormData(e.currentTarget);
    const vesselIds: number[] = [];
    
    vessels?.forEach((vessel) => {
      if (formData.get(`vessel_${vessel.id}`) === 'on') {
        vesselIds.push(vessel.id);
      }
    });

    updateMutation.mutate({
      id: selectedEmployee.id,
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string || undefined,
      vesselIds,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja desativar este funcionário?")) {
      deleteMutation.mutate({ id });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Funcionários</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie funcionários com acesso limitado ao sistema
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Funcionário
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {employees?.filter((e: any) => e.is_active).map((employee: any) => (
          <Card key={employee.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <UserCog className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg">{employee.name}</CardTitle>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedEmployee(employee);
                      setIsEditDialogOpen(true);
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(employee.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <CardDescription>{employee.email}</CardDescription>
            </CardHeader>
            <CardContent>
              {employee.phone && (
                <p className="text-sm text-muted-foreground mb-2">
                  📞 {employee.phone}
                </p>
              )}
              {employee.vesselIds && employee.vesselIds.length > 0 && (
                <div className="text-sm">
                  <p className="font-medium mb-1">Embarcações responsáveis:</p>
                  <ul className="list-disc list-inside text-muted-foreground">
                    {employee.vesselIds.map((vesselId: number) => {
                      const vessel = vessels?.find(v => v.id === vesselId);
                      return vessel ? <li key={vesselId}>{vessel.name}</li> : null;
                    })}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Novo Funcionário</DialogTitle>
              <DialogDescription>
                Cadastre um novo funcionário com acesso limitado
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" name="phone" type="tel" />
              </div>
              <div className="grid gap-2">
                <Label>Embarcações Responsáveis</Label>
                <div className="space-y-2">
                  {vessels?.map((vessel) => (
                    <div key={vessel.id} className="flex items-center space-x-2">
                      <Checkbox id={`vessel_${vessel.id}`} name={`vessel_${vessel.id}`} />
                      <label
                        htmlFor={`vessel_${vessel.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {vessel.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Cadastrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <form onSubmit={handleUpdate}>
            <DialogHeader>
              <DialogTitle>Editar Funcionário</DialogTitle>
              <DialogDescription>
                Atualize as informações do funcionário
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Nome *</Label>
                <Input
                  id="edit-name"
                  name="name"
                  defaultValue={selectedEmployee?.name}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email *</Label>
                <Input
                  id="edit-email"
                  name="email"
                  type="email"
                  defaultValue={selectedEmployee?.email}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Telefone</Label>
                <Input
                  id="edit-phone"
                  name="phone"
                  type="tel"
                  defaultValue={selectedEmployee?.phone || ""}
                />
              </div>
              <div className="grid gap-2">
                <Label>Embarcações Responsáveis</Label>
                <div className="space-y-2">
                  {vessels?.map((vessel) => (
                    <div key={vessel.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`vessel_${vessel.id}`}
                        name={`vessel_${vessel.id}`}
                        defaultChecked={selectedEmployee?.vesselIds?.includes(vessel.id)}
                      />
                      <label
                        htmlFor={`vessel_${vessel.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {vessel.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
