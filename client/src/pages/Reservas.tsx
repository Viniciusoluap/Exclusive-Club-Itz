import { useAuth } from "@/_core/hooks/useAuth";
import { WeatherWidget } from "@/components/WeatherWidget";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight, Loader2, Plus, X, Menu } from "lucide-react";
import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { MobileMenu } from "@/components/MobileMenu";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const WEEKDAYS = ["Dom", "2ª", "3ª", "4ª", "5ª", "6ª", "Sáb"];

// Status de dias
type DayStatus = 'available' | 'booked' | 'maintenance' | 'closed';

export default function Reservas() {
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [weatherData, setWeatherData] = useState<any>(null);
  
  // Buscar previsão do tempo quando selecionar data
  const { data: weather } = trpc.weather.forecast.useQuery(
    { date: selectedDate?.getTime() || Date.now() },
    { enabled: !!selectedDate }
  );
  
  // Atualizar weatherData quando weather mudar
  React.useEffect(() => {
    if (weather) {
      setWeatherData(weather);
    }
  }, [weather]);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);

  const utils = trpc.useUtils();

  // Buscar quotas do usuário
  const trpcAny = trpc as any;
  const { data: myQuotas } = trpcAny.bookings?.myQuotas.useQuery() || { data: [] };

  // Buscar todas as embarcações
  const { data: allVessels } = trpc.vessels.list.useQuery();

  // Filtrar apenas embarcações que o usuário possui quota
  const userVessels = useMemo(() => {
    if (!myQuotas || !allVessels) return [];
    const vesselIdsSet = new Set(myQuotas.map((q: any) => q.vesselId));
    const vesselIds = Array.from(vesselIdsSet);
    return allVessels.filter(v => vesselIds.includes(v.id));
  }, [myQuotas, allVessels]);

  // Fetch bookings for current month
  const startOfMonth = useMemo(() => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    return date.getTime();
  }, [currentMonth]);

  const endOfMonth = useMemo(() => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);
    return date.getTime();
  }, [currentMonth]);

  const { data: bookings, refetch } = trpc.bookings.getByDateRange.useQuery({
    startDate: startOfMonth,
    endDate: endOfMonth,
  });

  // Fetch maintenances
  const { data: monthMaintenances } = trpcAny.maintenances?.getActive.useQuery({
    startDate: startOfMonth,
    endDate: endOfMonth,
  }) || { data: [] };

  // Create booking mutation
  const createBooking = trpc.bookings.create.useMutation({
    onSuccess: () => {
      toast.success("Reserva criada com sucesso!");
      setShowBookingDialog(false);
      setSelectedDate(null);
      setSelectedVessel(null);
      setNotes("");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar reserva");
    },
  });

  // Cancel booking mutation
  const cancelBooking = trpc.bookings.cancel.useMutation({
    onSuccess: () => {
      toast.success("Reserva cancelada com sucesso!");
      setShowDetailsDialog(false);
      setSelectedBooking(null);
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao cancelar reserva");
    },
  });

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  }, [currentMonth]);

  // Group bookings by date
  const bookingsByDate = useMemo(() => {
    if (!bookings) return {};
    
    const grouped: Record<string, any[]> = {};
    bookings.forEach((booking: any) => {
      const date = new Date(booking.startTime);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(booking);
    });
    
    return grouped;
  }, [bookings]);

  // Função para determinar o status de um dia para uma embarcação específica
  const getDayStatus = (date: Date, vesselId: number): DayStatus => {
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const dayBookings = bookingsByDate[dateKey] || [];
    
    // Verificar se tem reserva para esta embarcação
    const hasBooking = dayBookings.some((b: any) => b.vesselId === vesselId);
    if (hasBooking) return 'booked';
    
    // Verificar manutenção
    const hasMaintenance = monthMaintenances?.some((m: any) => {
      const maintenanceDate = new Date(m.scheduled_date);
      return maintenanceDate.toDateString() === date.toDateString() && m.vessel_id === vesselId;
    });
    if (hasMaintenance) return 'maintenance';
    
    // Verificar se é segunda-feira (não abrimos)
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 1) return 'closed';
    
    // Verificar se é passado
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return 'closed';
    
    return 'available';
  };

  const handleDateClick = (date: Date, vesselId: number) => {
    const status = getDayStatus(date, vesselId);
    if (status !== 'available') {
      if (status === 'booked') {
        // Mostrar detalhes da reserva
        const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        const dayBookings = bookingsByDate[dateKey] || [];
        const booking = dayBookings.find((b: any) => b.vesselId === vesselId);
        if (booking) {
          setSelectedBooking(booking);
          setShowDetailsDialog(true);
        }
      }
      return;
    }
    
    setSelectedDate(date);
    setSelectedVessel(vesselId);
    setShowBookingDialog(true);
  };

  const handlePreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const handleMonthSelect = (month: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), month));
  };

  const handleCreateBooking = () => {
    if (!selectedDate || !selectedVessel) {
      toast.error("Selecione uma data e embarcação");
      return;
    }

    // Set time to 10:00 AM for start and 6:00 PM for end
    const startTime = new Date(selectedDate);
    startTime.setHours(10, 0, 0, 0);

    const endTime = new Date(selectedDate);
    endTime.setHours(18, 0, 0, 0);

    createBooking.mutate({
      vesselId: selectedVessel,
      bookingDate: startTime.getTime(),
      notes: notes || undefined,
    });
  };

  const handleCancelBooking = () => {
    if (!selectedBooking) return;
    
    if (window.confirm("Tem certeza que deseja cancelar esta reserva?")) {
      cancelBooking.mutate({ id: selectedBooking.id });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer">
                <img src={APP_LOGO} alt="Logo" className="h-10 w-10 rounded-lg" />
                <span className="text-xl font-bold hidden sm:inline">Exclusive Club</span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/">
                <Button variant="ghost">Voltar ao Início</Button>
              </Link>
              <Button variant="ghost" onClick={logout}>
                Sair
              </Button>
            </nav>

            {/* Mobile Menu Button - Handled by MobileMenu component */}
            <div className="md:hidden">
              <MobileMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6 space-y-8">
        {/* Month Navigation */}
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePreviousMonth}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <Select
            value={currentMonth.getMonth().toString()}
            onValueChange={(value) => handleMonthSelect(parseInt(value))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue>
                {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month, index) => (
                <SelectItem key={index} value={index.toString()}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={handleNextMonth}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Legenda Global */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 justify-center text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-500"></div>
                <span>Disponível</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-red-500"></div>
                <span>Reservado</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-orange-500"></div>
                <span>Manutenção</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gray-400"></div>
                <span>Não Abrimos</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendários por Embarcação */}
        {userVessels.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">
                Você não possui quotas cadastradas. Entre em contato com o administrador.
              </p>
            </CardContent>
          </Card>
        ) : (
          userVessels.map((vessel) => (
            <Card key={vessel.id} className="overflow-hidden">
              <CardHeader className="pb-3 bg-gradient-to-r from-primary/10 to-primary/5">
                <CardTitle className="text-lg sm:text-xl font-semibold">{vessel.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4">
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1">
                  {WEEKDAYS.map((day) => (
                    <div
                      key={day}
                      className="text-center text-[10px] sm:text-xs font-bold text-muted-foreground py-1 sm:py-1.5"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                  {calendarDays.map((date, index) => {
                    if (!date) {
                      return <div key={`empty-${index}`} className="aspect-square" />;
                    }

                    const status = getDayStatus(date, vessel.id);
                    const isToday = 
                      date.getDate() === new Date().getDate() &&
                      date.getMonth() === new Date().getMonth() &&
                      date.getFullYear() === new Date().getFullYear();

                    const statusColors = {
                      available: 'bg-green-500/90 hover:bg-green-600 text-white border-green-600',
                      booked: 'bg-red-500/90 text-white border-red-600',
                      maintenance: 'bg-orange-500/90 text-white border-orange-600',
                      closed: 'bg-gray-300 text-gray-600 border-gray-400',
                    };

                    return (
                      <div
                        key={index}
                        className={`
                          relative border-2 rounded-md aspect-square flex items-center justify-center
                          transition-all cursor-pointer font-semibold
                          ${statusColors[status]}
                          ${isToday ? 'ring-2 ring-offset-1 ring-primary shadow-lg' : ''}
                          ${status === 'available' ? 'hover:scale-110 hover:shadow-md active:scale-95' : ''}
                          text-xs sm:text-sm
                        `}
                        onClick={() => handleDateClick(date, vessel.id)}
                      >
                        {date.getDate()}
                        {isToday && (
                          <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Booking Dialog */}
      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Reserva</DialogTitle>
            <DialogDescription>
              {selectedDate && `${selectedDate.getDate()} de ${MONTHS[selectedDate.getMonth()]} de ${selectedDate.getFullYear()}`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Embarcação</label>
              <p className="text-sm text-muted-foreground mt-1">
                {userVessels.find(v => v.id === selectedVessel)?.name}
              </p>
            </div>

            {/* Weather Info */}
            {weatherData && (
              <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Previsão do Tempo</p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 capitalize">{weatherData.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl">{weatherData.emoji}</span>
                    <span className="text-2xl font-bold text-blue-900 dark:text-blue-100">{weatherData.temperature}°C</span>
                  </div>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-blue-700 dark:text-blue-300">
                  <span>💧 {weatherData.humidity}%</span>
                  <span>💨 {weatherData.windSpeed} km/h</span>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Observações</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Adicione observações..."
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBookingDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateBooking} disabled={createBooking.isPending}>
              {createBooking.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar Reserva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes da Reserva</DialogTitle>
          </DialogHeader>
          
          {selectedBooking && (
            <div className="space-y-3">
              <div>
                <span className="text-sm font-medium">Cliente:</span>
                <p className="text-sm text-muted-foreground">{selectedBooking.clientName}</p>
              </div>
              <div>
                <span className="text-sm font-medium">Embarcação:</span>
                <p className="text-sm text-muted-foreground">
                  {userVessels.find(v => v.id === selectedBooking.vesselId)?.name}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium">Data:</span>
                <p className="text-sm text-muted-foreground">
                  {new Date(selectedBooking.startTime).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium">Horário:</span>
                <p className="text-sm text-muted-foreground">
                  {new Date(selectedBooking.startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {' - '}
                  {new Date(selectedBooking.endTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {selectedBooking.notes && (
                <div>
                  <span className="text-sm font-medium">Observações:</span>
                  <p className="text-sm text-muted-foreground">{selectedBooking.notes}</p>
                </div>
              )}
              <div>
                <span className="text-sm font-medium">Status:</span>
                <p className="text-sm text-muted-foreground capitalize">{selectedBooking.status}</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
              Fechar
            </Button>
            {selectedBooking && selectedBooking.status === 'confirmed' && selectedBooking.clientEmail === user?.email && (
              <Button variant="destructive" onClick={handleCancelBooking} disabled={cancelBooking.isPending}>
                {cancelBooking.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Cancelar Reserva
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
