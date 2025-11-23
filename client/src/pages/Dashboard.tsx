import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_LOGO, APP_TITLE, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Anchor, BarChart3, Calendar, Ship, TrendingUp } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { user, loading, isAuthenticated } = useAuth();
  const { data: stats, isLoading: statsLoading } = trpc.stats.client.useQuery(undefined, {
    enabled: isAuthenticated,
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
              <span className="text-sm text-gray-600">{user?.name}</span>
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
              <div className="text-2xl font-bold">{stats?.upcomingBookings || 0}</div>
              <p className="text-xs text-muted-foreground">Agendadas</p>
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
