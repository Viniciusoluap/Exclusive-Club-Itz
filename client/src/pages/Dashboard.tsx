import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_LOGO, APP_TITLE, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Anchor, BarChart3, Calendar, Ship, TrendingUp, Pencil, Check, X, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Link } from "wouter";
import { useMemo } from "react";

function ActiveBookingsSection() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  
  // Buscar reservas ativas do usuário
  const { data: myBookings, isLoading } = trpc.bookings.myBookings.useQuery();
  
  // Buscar embarcações
  const { data: vessels } = trpc.vessels.list.useQuery();
  
  // Mutation para cancelar reserva
  const cancelBooking = trpc.bookings.cancel.useMutation({
    onSuccess: () => {
      toast.success("Reserva cancelada com sucesso!");
      utils.bookings.myBookings.invalidate();
      utils.stats.client.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao cancelar reserva");
    },
  });
  
  const handleCancelBooking = (bookingId: number) => {
    if (window.confirm("Tem certeza que deseja cancelar esta reserva?")) {
      cancelBooking.mutate({ id: bookingId });
    }
  };
  
  // Filtrar apenas reservas confirmadas (futuras)
  const activeBookings = useMemo(() => {
    if (!myBookings) return [];
    return myBookings.filter((b: any) => b.status === 'confirmed');
  }, [myBookings]);
  
  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      </div>
    );
  }
  
  if (!activeBookings || activeBookings.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Você não possui reservas ativas no momento.
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {activeBookings.map((booking: any) => {
        const vessel = vessels?.find(v => v.id === booking.vesselId);
        const bookingDate = new Date(booking.bookingDate);
        const isPast = bookingDate < new Date();
        
        return (
          <div
            key={booking.id}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Ship className="h-4 w-4 text-primary" />
                <span className="font-semibold">{vessel?.name || 'Embarcação'}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                <Calendar className="h-3 w-3 inline mr-1" />
                {bookingDate.toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })}
              </div>
              {booking.notes && (
                <div className="text-xs text-muted-foreground mt-1">
                  Obs: {booking.notes}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <div className="text-right mr-2">
                <div className="text-xs font-semibold text-green-600">
                  Confirmada
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleCancelBooking(booking.id)}
                disabled={cancelBooking.isPending || isPast}
              >
                {cancelBooking.isPending ? "Cancelando..." : "Cancelar"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuotaUsageSection() {
  const { user } = useAuth();
  const trpcAny = trpc as any;
  
  // Buscar quotas do usuário
  const { data: myQuotas } = trpcAny.bookings?.myQuotas.useQuery() || { data: [] };
  
  // Buscar reservas do usuário
  const { data: myBookings } = trpc.bookings.myBookings.useQuery();
  
  // Buscar embarcações
  const { data: vessels } = trpc.vessels.list.useQuery();
  
  // Calcular uso de quotas por embarcação
  const quotaUsage = useMemo(() => {
    if (!myQuotas || !myBookings || !vessels) return [];
    
    // Agrupar quotas por embarcação
    const quotasByVessel: Record<number, any[]> = {};
    myQuotas.forEach((quota: any) => {
      if (!quotasByVessel[quota.vesselId]) {
        quotasByVessel[quota.vesselId] = [];
      }
      quotasByVessel[quota.vesselId].push(quota);
    });
    
    // Calcular uso para cada embarcação
    return Object.entries(quotasByVessel).map(([vesselId, quotas]) => {
      const vessel = vessels.find(v => v.id === parseInt(vesselId));
      
      // Calcular total de reservas permitidas no mês
      // Cota inteira = 2 reservas/mês, Meia cota = 1 reserva/mês
      const totalReservationsAllowed = quotas.reduce((sum: number, quota: any) => {
        return sum + (quota.quotaType === 'full' ? 2 : 1);
      }, 0);
      
      // Pegar início e fim do mês atual
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      
      // Contar reservas confirmadas ou usadas desta embarcação NO MÊS ATUAL
      const usedBookings = myBookings.filter((b: any) => {
        const bookingDate = new Date(b.bookingDate);
        return b.vesselId === parseInt(vesselId) && 
               (b.status === 'confirmed' || b.status === 'used') &&
               bookingDate >= startOfMonth &&
               bookingDate <= endOfMonth;
      }).length;
      
      return {
        vesselId: parseInt(vesselId),
        vesselName: vessel?.name || 'Desconhecida',
        total: totalReservationsAllowed,
        used: usedBookings,
        percentage: totalReservationsAllowed > 0 ? (usedBookings / totalReservationsAllowed) * 100 : 0,
      };
    });
  }, [myQuotas, myBookings, vessels]);
  
  if (!quotaUsage || quotaUsage.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Você ainda não possui quotas cadastradas.
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {quotaUsage.map((quota) => (
        <div key={quota.vesselId} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ship className="h-5 w-5 text-primary" />
              <span className="font-semibold">{quota.vesselName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">
                {quota.used}/{quota.total}
              </span>
              {quota.used >= quota.total ? (
                <XCircle className="h-5 w-5 text-red-500" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                quota.percentage >= 100 
                  ? 'bg-red-500' 
                  : quota.percentage >= 75 
                  ? 'bg-orange-500' 
                  : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(quota.percentage, 100)}%` }}
            />
          </div>
          
          <div className="text-xs text-muted-foreground">
            {quota.used >= quota.total 
              ? 'Todas as quotas utilizadas' 
              : `${quota.total - quota.used} quota${quota.total - quota.used !== 1 ? 's' : ''} disponíve${quota.total - quota.used !== 1 ? 'is' : 'l'}`
            }
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user, loading, isAuthenticated } = useAuth();
  const { data: stats, isLoading: statsLoading } = trpc.stats.client.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const utils = trpc.useUtils();
  
  // @ts-ignore
  const updateName = trpc.auth.updateName.useMutation({
    onSuccess: () => {
      toast.success("Nome atualizado com sucesso!");
      setIsEditingName(false);
      utils.auth.me.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar nome");
    },
  });

  if (loading || statsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-cyan-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-cyan-50">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <img src={APP_LOGO} alt={APP_TITLE} className="h-20 mx-auto mb-4" />
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>Faça login para ver seu dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <a href={getLoginUrl()}>Entrar</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer">
                <img src={APP_LOGO} alt={APP_TITLE} className="h-12" />
                <span className="font-bold text-xl text-gray-900">{APP_TITLE}</span>
              </div>
            </Link>
            <nav className="flex items-center gap-4">
              <Link href="/reservas">
                <Button variant="ghost">Minhas Reservas</Button>
              </Link>
              <Link href="/galeria">
                <Button variant="ghost">Galeria</Button>
              </Link>
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Digite seu nome"
                    className="h-8 w-48"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      if (newName.trim()) {
                        updateName.mutate({ name: newName.trim() });
                      }
                    }}
                    disabled={!newName.trim() || updateName.isPending}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      setIsEditingName(false);
                      setNewName("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">{user?.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      setIsEditingName(true);
                      setNewName(user?.name || "");
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Meu Dashboard</h1>
          <p className="text-gray-600">Acompanhe suas estatísticas e histórico de uso</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Reservas</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalBookings || 0}</div>
              <p className="text-xs text-muted-foreground">Desde o início</p>
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
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-2xl font-bold">{stats?.upcomingBookings || 0}</div>
                  <p className="text-xs text-muted-foreground">Agendadas</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reservas Concluídas</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.completedBookings || 0}</div>
              <p className="text-xs text-muted-foreground">Utilizadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Embarcação Favorita</CardTitle>
              <Ship className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold truncate">{stats?.favoriteVessel || "N/A"}</div>
              <p className="text-xs text-muted-foreground">Mais utilizada</p>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Usage Chart */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Uso Mensal</CardTitle>
            <CardDescription>Suas reservas nos últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end justify-between gap-4">
              {stats?.monthlyUsage.map((month, idx) => {
                const maxCount = Math.max(...(stats.monthlyUsage.map(m => m.count) || [1]));
                const height = maxCount > 0 ? (month.count / maxCount) * 100 : 0;
                
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full bg-blue-100 rounded-t-lg relative group cursor-pointer hover:bg-blue-200 transition-colors" 
                         style={{ height: `${height}%`, minHeight: month.count > 0 ? '20px' : '0' }}>
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {month.count} reserva{month.count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <span className="text-xs text-gray-600 text-center">{month.month}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Active Bookings */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Minhas Reservas Ativas</CardTitle>
            <CardDescription>Visualize e gerencie suas reservas confirmadas</CardDescription>
          </CardHeader>
          <CardContent>
            <ActiveBookingsSection />
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/reservas">
                <Button className="w-full" variant="default">
                  <Calendar className="mr-2 h-4 w-4" />
                  Ver Minhas Reservas
                </Button>
              </Link>
              <Link href="/galeria">
                <Button className="w-full" variant="outline">
                  <Anchor className="mr-2 h-4 w-4" />
                  Ver Galeria de Fotos
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Nome:</span>
                <span className="font-medium">{user?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Email:</span>
                <span className="font-medium">{user?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Cancelamentos:</span>
                <span className="font-medium">{stats?.cancelledBookings || 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
