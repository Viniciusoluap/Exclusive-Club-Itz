import { useAuth } from "@/_core/hooks/useAuth";
// import { InspectionChargesSection } from "@/components/InspectionChargesSection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_LOGO, APP_TITLE, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Anchor, BarChart3, Calendar, Ship, TrendingUp, Pencil, Check, X, CheckCircle2, XCircle, Fuel, DollarSign, Copy, QrCode, ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

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

function VesselDocumentsSection() {
  const { user } = useAuth();
  
  // Buscar embarcações onde o cliente possui cotas
  const { data: myVessels, isLoading } = trpc.vessels.getMyVessels.useQuery();
  
  if (isLoading) {
    return (
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📄 Documentos das Minhas Embarcações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (!myVessels || myVessels.length === 0) {
    return (
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📄 Documentos das Minhas Embarcações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Você não possui cotas em nenhuma embarcação.
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          📄 Documentos das Minhas Embarcações
        </CardTitle>
        <CardDescription>
          Acesse os documentos das embarcações onde você possui cotas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {myVessels.map((vessel: any) => (
            <Card key={vessel.id} className="border-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Ship className="h-5 w-5 text-primary" />
                  {vessel.name}
                </CardTitle>
                <CardDescription className="capitalize">{vessel.type}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Documento Principal */}
                <div className="border-l-4 border-primary pl-3">
                  <p className="text-sm font-medium mb-2">📄 Documento da Embarcação</p>
                  {vessel.documentUrl ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => window.open(vessel.documentUrl, "_blank")}
                    >
                      📎 Baixar Documento
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">Não disponível</p>
                  )}
                </div>
                
                {/* Documento Extra */}
                <div className="border-l-4 border-muted pl-3">
                  <p className="text-sm font-medium mb-2">📎 Documento Extra</p>
                  {vessel.extraDocumentUrl ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => window.open(vessel.extraDocumentUrl, "_blank")}
                    >
                      📎 Baixar Documento
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">Não disponível</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
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
  const [, setLocation] = useLocation();
  const { data: stats, isLoading: statsLoading } = trpc.stats.client.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfileName, setEditProfileName] = useState("");
  const [editProfileEmail, setEditProfileEmail] = useState("");
  const utils = trpc.useUtils();

  // Redirecionamento automático apenas para funcionários
  useEffect(() => {
    if (!loading && user) {
      if (user.role === 'employee') {
        setLocation('/employee/reservas');
      }
      // Admin e clientes veem o dashboard normalmente
    }
  }, [user, loading, setLocation]);
  
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
  // @ts-ignore
  const updateEmail = trpc.auth.updateEmail.useMutation({
    onSuccess: () => {
      toast.success("Email atualizado com sucesso!");
      utils.auth.me.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar email");
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
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer">
                <img src={APP_LOGO} alt={APP_TITLE} className="h-10 md:h-12" />
                <span className="font-bold text-base md:text-xl text-gray-900 truncate">{APP_TITLE}</span>
              </div>
            </Link>
            <nav className="flex flex-wrap items-center gap-2 md:gap-4">
              <Link href="/reservas">
                <Button variant="ghost">Minhas Reservas</Button>
              </Link>
              <Link href="/">
                <Button variant="ghost" className="flex items-center gap-1">
                  <ArrowLeft className="h-4 w-4" />
                  Voltar
                </Button>
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

        {/* Monthly Usage Chart — com painel de resumo e escala Y fixa 1-7 */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Uso Mensal</CardTitle>
            <CardDescription>Suas reservas nos últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Gráfico com eixo Y fixo 1-7 + linha de referência "Bom uso" no nível 3 */}
              <div className="flex-1">
                <div className="flex gap-2">
                  {/* Eixo Y — labels alinhados à escala 0-6, cada nível em (v/6)*100% da altura */}
                  <div className="flex flex-col-reverse items-end pr-1 relative" style={{ height: '224px' }}>
                    {[1,2,3,4,5,6].map(v => (
                      <div
                        key={v}
                        className="absolute flex items-center"
                        style={{ bottom: `calc(${(v / 6) * 100}% + 20px)`, transform: 'translateY(50%)' }}
                      >
                        <span className={`text-xs leading-none ${v === 3 ? 'text-teal-500 font-semibold' : 'text-gray-400'}`}>{v}</span>
                      </div>
                    ))}
                  </div>
                  {/* Área do gráfico com linhas de grade e barras */}
                  <div className="flex-1 relative" style={{ height: '224px' }}>
                    {/* Linhas de grade horizontais — escala 0-6, cada nível em (v/6)*100% */}
                    {[0,1,2,3,4,5,6].map(v => {
                      const bottomPct = (v / 6) * 100;
                      const isBomUso = v === 3;
                      return (
                        <div
                          key={v}
                          className="absolute left-0 right-0"
                          style={{ bottom: `${bottomPct}%`, height: '1px' }}
                        >
                          {isBomUso ? (
                            <>
                              <div className="w-full border-t-2 border-dashed border-teal-400 opacity-80" />
                              <span className="absolute right-0 -top-4 text-xs text-teal-500 font-medium bg-white px-1 rounded">Bom uso</span>
                            </>
                          ) : (
                            <div className="w-full border-t border-gray-100" />
                          )}
                        </div>
                      );
                    })}
                    {/* Barras — escala unificada MAX_Y=6, base alinhada ao nível 0 (abaixo do numeral 1) */}
                    <div className="absolute inset-x-0 flex items-end justify-between gap-2" style={{ bottom: 0, top: 0 }}>
                      {stats?.monthlyUsage.map((month, idx) => {
                        const MAX_Y = 6;
                        const clampedCount = Math.min(month.count, MAX_Y);
                        // Altura proporcional: count/6 * 100% — alinhada com o eixo Y
                        const heightPct = (clampedCount / MAX_Y) * 100;
                        // Abreviar label: "nov. de 2025" → "nov 25"
                        const shortLabel = month.month
                          .replace(/\. de /, ' ')
                          .replace(/de /, '')
                          .replace(/\.$/, '')
                          .replace(/(\d{4})/, (y) => y.slice(2));
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end" style={{ paddingBottom: '20px' }}>
                            <div
                              className="w-full bg-cyan-400 rounded-t-lg relative group cursor-pointer hover:bg-cyan-500 transition-colors"
                              style={{ height: `${heightPct}%`, minHeight: month.count > 0 ? '6px' : '0' }}
                            >
                              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                {month.count} reserva{month.count !== 1 ? 's' : ''}
                              </div>
                            </div>
                            <span className="absolute bottom-0 text-[10px] sm:text-xs text-gray-500 text-center leading-tight">{shortLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Painel de resumo */}
              <div className="lg:w-56 grid grid-cols-2 lg:grid-cols-1 gap-3 content-start">
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    <span className="text-xs text-gray-500 font-medium">Total de Reservas</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-700">{stats?.totalBookings || 0}</div>
                  <p className="text-xs text-gray-400">Desde o início</p>
                </div>

                <div className="bg-green-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="text-xs text-gray-500 font-medium">Próximas Reservas</span>
                  </div>
                  {stats?.nextBookings && stats.nextBookings.length > 0 ? (
                    <div>
                      <div className="text-sm font-bold text-green-700 truncate">{stats.nextBookings[0].vesselName}</div>
                      <p className="text-xs text-gray-400">{new Date(stats.nextBookings[0].bookingDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</p>
                    </div>
                  ) : (
                    <div>
                      <div className="text-2xl font-bold text-green-700">{stats?.upcomingBookings || 0}</div>
                      <p className="text-xs text-gray-400">Agendadas</p>
                    </div>
                  )}
                </div>

                <div className="bg-purple-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="h-4 w-4 text-purple-500" />
                    <span className="text-xs text-gray-500 font-medium">Concluídas</span>
                  </div>
                  <div className="text-2xl font-bold text-purple-700">{stats?.completedBookings || 0}</div>
                  <p className="text-xs text-gray-400">Utilizadas</p>
                </div>

                <div className="bg-orange-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Ship className="h-4 w-4 text-orange-500" />
                    <span className="text-xs text-gray-500 font-medium">Embarcação Favorita</span>
                  </div>
                  <div className="text-sm font-bold text-orange-700 truncate">{stats?.favoriteVessel || "N/A"}</div>
                  <p className="text-xs text-gray-400">Mais utilizada</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Link href="/reservas">
                  <Button className="w-full h-20 flex flex-col gap-1" variant="default">
                    <Calendar className="h-5 w-5" />
                    <span className="text-xs">Reservas</span>
                  </Button>
                </Link>
                <Link href="/dashboard/meus-abastecimentos">
                  <Button className="w-full h-20 flex flex-col gap-1" variant="outline">
                    <Fuel className="h-5 w-5" />
                    <span className="text-xs">Abastecimentos</span>
                  </Button>
                </Link>
                <Link href="/pagamento-danos">
                  <Button className="w-full h-20 flex flex-col gap-1" variant="outline">
                    <XCircle className="h-5 w-5" />
                    <span className="text-xs">Reparos</span>
                  </Button>
                </Link>
                <Link href="/mensalidades">
                  <Button className="w-full h-20 flex flex-col gap-1" variant="outline">
                    <DollarSign className="h-5 w-5" />
                    <span className="text-xs">Mensalidades</span>
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Informações</CardTitle>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1"
                onClick={() => {
                  setIsEditingProfile(true);
                  setEditProfileName(user?.name || "");
                  setEditProfileEmail(user?.email || "");
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>
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

        {/* Modal de edição de perfil */}
        <Dialog open={isEditingProfile} onOpenChange={setIsEditingProfile}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Editar Informações</DialogTitle>
              <DialogDescription>Atualize seu nome e email de contato.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Nome</label>
                <Input
                  value={editProfileName}
                  onChange={(e) => setEditProfileName(e.target.value)}
                  placeholder="Seu nome"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Email</label>
                <Input
                  value={editProfileEmail}
                  onChange={(e) => setEditProfileEmail(e.target.value)}
                  placeholder="seu@email.com"
                  type="email"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsEditingProfile(false)}>Cancelar</Button>
              <Button
                onClick={() => {
                  if (editProfileName.trim()) {
                    updateName.mutate({ name: editProfileName.trim() });
                  }
                  if (editProfileEmail.trim() && editProfileEmail !== user?.email) {
                    updateEmail.mutate({ email: editProfileEmail.trim() });
                  }
                  setIsEditingProfile(false);
                }}
                disabled={!editProfileName.trim() || updateName.isPending || updateEmail.isPending}
              >
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

         {/* Seções de Abastecimentos e Vistorias removidas do Dashboard — acessíveis pelas Ações Rápidas */}

        {/* Documentos das Minhas Embarcações Section */}
        <VesselDocumentsSection />
      </main>
    </div>
  );
}
