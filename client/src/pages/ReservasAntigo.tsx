import { useAuth } from "@/_core/hooks/useAuth";
import { WeatherWidget } from "@/components/WeatherWidget";
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
import { Textarea } from "@/components/ui/textarea";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Loader2, Ship, X, Pencil, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function Reservas() {
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [showBookingDialog, setShowBookingDialog] = useState(false);
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

  // Fetch vessels
  const { data: vessels, isLoading: vesselsLoading } = trpc.vessels.list.useQuery();

  // Fetch user's bookings
  const { data: myBookings, isLoading: bookingsLoading } = trpc.bookings.myBookings.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Fetch user's quota information
  const { data: quotaInfo } = trpc.bookings.myQuota.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Fetch bookings for current month
  const startOfMonth = useMemo(() => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }, [currentMonth]);

  const endOfMonth = useMemo(() => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    date.setHours(23, 59, 59, 999);
    return date.getTime();
  }, [currentMonth]);

  const { data: monthBookings } = trpc.bookings.getByDateRange.useQuery(
    { startDate: startOfMonth, endDate: endOfMonth },
    { enabled: isAuthenticated }
  );

  // Fetch maintenances for current month (public endpoint)
  // @ts-ignore - maintenances router exists but TypeScript types not regenerated
  const { data: monthMaintenances } = trpc.maintenances.getActive.useQuery(
    { startDate: startOfMonth, endDate: endOfMonth },
    { enabled: true }
  );

  // Create booking mutation
  const createBooking = trpc.bookings.create.useMutation({
    onSuccess: () => {
      toast.success("Reserva criada com sucesso!");
      utils.bookings.myBookings.invalidate();
      utils.bookings.getByDateRange.invalidate();
      setShowBookingDialog(false);
      setSelectedDate(null);
      setSelectedVessel(null);
      setNotes("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Cancel booking mutation
  const cancelBooking = trpc.bookings.cancel.useMutation({
    onSuccess: () => {
      toast.success("Reserva cancelada com sucesso!");
      utils.bookings.myBookings.invalidate();
      utils.bookings.getByDateRange.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
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

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  }, [currentMonth]);

  const handlePreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const isDateDisabled = (date: Date | null): boolean => {
    if (!date) return true;

    // Check if it's Monday (1) - using local time since calendar shows local dates
    if (date.getDay() === 1) return true;

    // Check if it's in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return true;

    return false;
  };

  const isDateBooked = (date: Date | null, vesselId: number): boolean => {
    if (!date || !monthBookings) return false;

    // Normalizar data para meia-noite para comparação
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    const dateTimestamp = normalizedDate.getTime();

    return monthBookings.some(
      (booking) => {
        // Normalizar bookingDate também
        const bookingNormalized = new Date(booking.bookingDate);
        bookingNormalized.setHours(0, 0, 0, 0);
        
        return booking.vesselId === vesselId &&
          bookingNormalized.getTime() === dateTimestamp &&
          booking.status === "confirmed";
      }
    );
  };

  const isDateInMaintenance = (date: Date | null, vesselId: number): boolean => {
    if (!date || !monthMaintenances) return false;

    const dateTimestamp = date.getTime();
    return monthMaintenances.some(
      (maintenance: any) =>
        maintenance.vesselId === vesselId &&
        maintenance.startDate <= dateTimestamp &&
        maintenance.endDate >= dateTimestamp &&
        maintenance.status !== 'cancelled'
    );
  };

  const handleDateClick = (date: Date | null, vesselId: number) => {
    if (!date || isDateDisabled(date) || isDateBooked(date, vesselId) || isDateInMaintenance(date, vesselId)) return;

    setSelectedDate(date);
    setSelectedVessel(vesselId);
    setShowBookingDialog(true);
  };

  const handleConfirmBooking = () => {
    if (!selectedDate || !selectedVessel) return;

    createBooking.mutate({
      vesselId: selectedVessel,
      bookingDate: selectedDate.getTime(),
      notes: notes || undefined,
    });
  };

  const handleCancelBooking = (bookingId: number) => {
    if (confirm("Tem certeza que deseja cancelar esta reserva?")) {
      cancelBooking.mutate({ id: bookingId });
    }
  };

  const activeBookingsCount = useMemo(() => {
    return myBookings?.filter((b) => b.status === "confirmed").length || 0;
  }, [myBookings]);

  // Calculate total max bookings across all vessels
  const maxBookings = useMemo(() => {
    if (!quotaInfo?.quotas) return 0;
    let total = 0;
    for (const quota of quotaInfo.quotas) {
      total += quota.quotaType === 'full' ? 2 : 1;
    }
    return total;
  }, [quotaInfo]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="max-w-md w-full mx-4">
          <CardHeader>
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>Você precisa fazer login para acessar o sistema de reservas.</CardDescription>
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

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-background border-b sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/">
              <a className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <img src={APP_LOGO} alt="Exclusive Club" className="h-10 w-10" style={{width: '70px', height: '65px', backgroundColor: '#1aacea', borderRadius: '8px', padding: '4px'}} />
                <span className="text-lg font-bold text-primary">Exclusive Club</span>
              </a>
            </Link>
            <div className="flex items-center gap-4">
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
                <div className="flex items-center gap-2 hidden sm:flex">
                  <span className="text-sm text-muted-foreground">
                    Olá, {user?.name}
                  </span>
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
              {user?.role === "admin" && (
                <Link href="/admin">
                  <Button variant="outline" size="sm">Admin</Button>
                </Link>
              )}
              <Link href="/">
                <Button variant="outline" size="sm">
                  Voltar ao Início
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
        {/* Status Banner */}
        <Card className="mb-8 border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Minhas Reservas</CardTitle>
                <CardDescription>
                  Você possui {activeBookingsCount} de {maxBookings} reservas ativas
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-primary">{activeBookingsCount}/{maxBookings}</div>
                <div className="text-sm text-muted-foreground">Reservas Ativas</div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Active Bookings */}
        {myBookings && myBookings.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Suas Reservas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {myBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          booking.status === "confirmed"
                            ? "bg-green-500"
                            : booking.status === "used"
                            ? "bg-blue-500"
                            : "bg-gray-400"
                        }`}
                      />
                      <div>
                        <div className="font-semibold">{booking.vesselName}</div>
                        <div className="text-sm text-muted-foreground">
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelBooking(booking.id)}
                          disabled={cancelBooking.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Calendar Section */}
        <Card>
          <CardHeader>
            <CardTitle>Calendário de Disponibilidade</CardTitle>
            <CardDescription>
              Selecione uma data disponível para fazer sua reserva. Segundas-feiras não estão
              disponíveis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {vesselsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : vessels && vessels.length > 0 ? (
              <div className="space-y-8">
                {vessels
                  .filter((vessel) => {
                    // Filtrar apenas embarcações que o cliente possui cota
                    if (!quotaInfo?.quotas) return false;
                    return quotaInfo.quotas.some((q) => q.vesselId === vessel.id);
                  })
                  .map((vessel) => (
                  <div key={vessel.id} className="space-y-4">
                    <div className="flex items-center gap-3 pb-2 border-b">
                      <Ship className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold">{vessel.name}</h3>
                    </div>

                    {/* Month Navigation */}
                    <div className="flex items-center justify-between">
                      <Button variant="outline" size="sm" onClick={handlePreviousMonth}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <h4 className="text-lg font-medium">
                        {currentMonth.toLocaleDateString("pt-BR", {
                          month: "long",
                          year: "numeric",
                        })}
                      </h4>
                      <Button variant="outline" size="sm" onClick={handleNextMonth}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-2">
                      {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                        <div key={day} className="text-center text-sm font-medium text-muted-foreground p-2">
                          {day}
                        </div>
                      ))}
                      {calendarDays.map((date, index) => {
                        const disabled = isDateDisabled(date);
                        const booked = date ? isDateBooked(date, vessel.id) : false;
                        const inMaintenance = date ? isDateInMaintenance(date, vessel.id) : false;
                        const isMonday = date?.getDay() === 1;

                        return (
                          <button
                            key={index}
                            onClick={() => handleDateClick(date, vessel.id)}
                            disabled={disabled || booked || inMaintenance}
                            className={`
                              aspect-square p-2 rounded-lg text-sm font-medium transition-all
                              ${!date ? "invisible" : ""}
                              ${
                                disabled
                                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                                  : inMaintenance
                                  ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 cursor-not-allowed"
                                  : booked
                                  ? "bg-destructive/20 text-destructive cursor-not-allowed"
                                  : "bg-primary/10 hover:bg-primary hover:text-primary-foreground cursor-pointer"
                              }
                              ${isMonday ? "relative after:content-['🚫'] after:absolute after:top-0 after:right-0 after:text-xs" : ""}
                              ${inMaintenance ? "relative after:content-['🔧'] after:absolute after:top-0 after:right-0 after:text-xs" : ""}
                            `}
                          >
                            {date?.getDate()}
                          </button>
                        );
                      })}
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-primary/10 border border-primary/20"></div>
                        <span className="text-muted-foreground">Disponível</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-destructive/20 border border-destructive/30"></div>
                        <span className="text-muted-foreground">Reservado</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700"></div>
                        <span className="text-muted-foreground">Manutenção 🔧</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-muted"></div>
                        <span className="text-muted-foreground">Indisponível</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Nenhuma embarcação disponível no momento.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Booking Dialog */}
      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Reserva</DialogTitle>
            <DialogDescription>
              Você está reservando para{" "}
              {selectedDate?.toLocaleDateString("pt-BR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Embarcação</label>
              <p className="text-lg">
                {vessels?.find((v) => v.id === selectedVessel)?.name}
              </p>
            </div>

            {selectedDate && (
              <WeatherWidget date={selectedDate} />
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">
                Observações (opcional)
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Adicione observações sobre sua reserva..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBookingDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmBooking} disabled={createBooking.isPending}>
              {createBooking.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  Confirmar Reserva
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
