import { useAuth } from "@/_core/hooks/useAuth";
import { WeatherWidget } from "@/components/WeatherWidget";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { MobileMenu } from "@/components/MobileMenu";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const WEEKDAYS = ["Dom", "2ª", "3ª", "4ª", "5ª", "6ª", "Sáb"];

export default function Reservas() {
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const utils = trpc.useUtils();

  // Fetch vessels
  const { data: vessels } = trpc.vessels.list.useQuery();

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
  const trpcAny = trpc as any;
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
    
    const days: (Date | null)[] = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  }, [currentMonth]);

  // Group bookings by date
  const bookingsByDate = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    
    bookings?.forEach((booking: any) => {
      const date = new Date(booking.startTime);
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      
      grouped[dateKey].push(booking);
    });
    
    return grouped;
  }, [bookings]);

  // Check if date is unavailable (Monday or has maintenance)
  const isDateUnavailable = (date: Date) => {
    if (date.getDay() === 1) return true; // Monday
    
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return monthMaintenances?.some((m: any) => {
      const maintenanceStart = new Date(m.startDate);
      const maintenanceEnd = new Date(m.endDate);
      const checkDate = new Date(date);
      checkDate.setHours(12, 0, 0, 0);
      return checkDate >= maintenanceStart && checkDate <= maintenanceEnd;
    });
  };

  const handlePreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const handleMonthSelect = (monthIndex: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), monthIndex));
  };

  const handleDateClick = (date: Date) => {
    if (isDateUnavailable(date)) {
      toast.error("Data indisponível");
      return;
    }
    
    setSelectedDate(date);
    setShowBookingDialog(true);
  };

  const handleBookingClick = (booking: any) => {
    setSelectedBooking(booking);
    setShowDetailsDialog(true);
  };

  const handleCreateBooking = () => {
    if (!selectedDate || !selectedVessel) {
      toast.error("Selecione uma embarcação");
      return;
    }

    const startTime = new Date(selectedDate);
    startTime.setHours(10, 0, 0, 0);

    const endTime = new Date(selectedDate);
    endTime.setHours(19, 0, 0, 0);

    createBooking.mutate({
      vesselId: selectedVessel,
      bookingDate: selectedDate.getTime(),
      notes: notes || undefined,
    });
  };

  const handleCancelBooking = () => {
    if (!selectedBooking) return;
    cancelBooking.mutate({ id: selectedBooking.id });
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

  const vesselColors: Record<number, string> = {
    1: "bg-blue-500",
    2: "bg-purple-500",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
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

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
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
              <SelectTrigger className="w-[180px]">
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

          <Button
            onClick={() => {
              setSelectedDate(new Date());
              setShowBookingDialog(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova Reserva</span>
          </Button>
        </div>

        {/* Calendar Grid */}
        <Card>
          <CardContent className="p-4">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="text-center text-sm font-semibold text-muted-foreground py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="aspect-square" />;
                }

                const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
                const dayBookings = bookingsByDate[dateKey] || [];
                const isUnavailable = isDateUnavailable(date);
                const isToday = 
                  date.getDate() === new Date().getDate() &&
                  date.getMonth() === new Date().getMonth() &&
                  date.getFullYear() === new Date().getFullYear();

                return (
                  <div
                    key={index}
                    className={`
                      border rounded-lg p-2 min-h-[100px] cursor-pointer
                      transition-colors hover:bg-accent/50
                      ${isToday ? 'border-primary border-2' : ''}
                      ${isUnavailable ? 'bg-muted cursor-not-allowed' : ''}
                    `}
                    onClick={() => !isUnavailable && handleDateClick(date)}
                  >
                    <div className={`text-sm font-semibold mb-1 ${isToday ? 'text-primary' : ''}`}>
                      {date.getDate()}
                    </div>
                    
                    {isUnavailable ? (
                      <div className="text-xs text-muted-foreground">
                        Indisponível
                      </div>
                    ) : dayBookings.length > 0 ? (
                      <div className="space-y-1">
                        {dayBookings.map((booking: any) => {
                          const vessel = vessels?.find(v => v.id === booking.vesselId);
                          const startTime = new Date(booking.startTime);
                          const endTime = new Date(booking.endTime);
                          
                          return (
                            <div
                              key={booking.id}
                              className={`
                                text-xs p-1 rounded text-white cursor-pointer
                                ${vesselColors[booking.vesselId] || 'bg-gray-500'}
                              `}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBookingClick(booking);
                              }}
                            >
                              <div className="font-semibold truncate">
                                {startTime.getHours()}:{startTime.getMinutes().toString().padStart(2, '0')}
                              </div>
                              <div className="truncate">{booking.clientName}</div>
                              <div className="truncate text-[10px]">{vessel?.name}</div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Sem eventos
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          {vessels?.map((vessel) => (
            <div key={vessel.id} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${vesselColors[vessel.id] || 'bg-gray-500'}`} />
              <span>{vessel.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Create Booking Dialog */}
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
              <Select
                value={selectedVessel?.toString()}
                onValueChange={(value) => setSelectedVessel(parseInt(value))}
              >
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
              <label className="text-sm font-medium">Horário</label>
              <p className="text-sm text-muted-foreground">10:00 - 19:00</p>
            </div>

            <div>
              <label className="text-sm font-medium">Observações (opcional)</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Adicione observações..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowBookingDialog(false);
                setSelectedDate(null);
                setSelectedVessel(null);
                setNotes("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateBooking}
              disabled={createBooking.isPending}
            >
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
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Embarcação</label>
                <p className="text-base">
                  {vessels?.find(v => v.id === selectedBooking.vesselId)?.name}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Data</label>
                <p className="text-base">
                  {new Date(selectedBooking.startTime).toLocaleDateString('pt-BR')}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Horário</label>
                <p className="text-base">
                  {new Date(selectedBooking.startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {' - '}
                  {new Date(selectedBooking.endTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Status</label>
                <p className="text-base capitalize">{selectedBooking.status}</p>
              </div>

              {selectedBooking.notes && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Observações</label>
                  <p className="text-base">{selectedBooking.notes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDetailsDialog(false);
                setSelectedBooking(null);
              }}
            >
              Fechar
            </Button>
            {selectedBooking?.status === 'confirmed' && (
              <Button
                variant="destructive"
                onClick={handleCancelBooking}
                disabled={cancelBooking.isPending}
              >
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
