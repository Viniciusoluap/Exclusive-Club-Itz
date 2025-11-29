import EmployeeDashboardLayout from "@/components/EmployeeDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Loader2, Wrench } from "lucide-react";
import { useState } from "react";

export default function EmployeeReservas() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Buscar todas as reservas do mês
  const { data: reservations, isLoading: loadingReservations } = trpc.bookings.getByMonth.useQuery({
    year,
    month: month + 1,
  });

  // Buscar todas as manutenções
  const { data: maintenances, isLoading: loadingMaintenances } = trpc.maintenances.list.useQuery();

  const isLoading = loadingReservations || loadingMaintenances;

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const previousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const getReservationsForDay = (day: number) => {
    if (!reservations) return [];
    const dayStart = new Date(year, month, day, 0, 0, 0).getTime();
    const dayEnd = new Date(year, month, day, 23, 59, 59).getTime();
    
    return reservations.filter(r => {
      const bookingDate = r.booking_date;
      return bookingDate >= dayStart && bookingDate <= dayEnd;
    });
  };

  const getMaintenancesForDay = (day: number) => {
    if (!maintenances) return [];
    const dayStart = new Date(year, month, day, 0, 0, 0).getTime();
    const dayEnd = new Date(year, month, day, 23, 59, 59).getTime();
    
    return maintenances.filter((m: any) => {
      // Manutenção está ativa se o dia está entre start_date e end_date
      return m.start_date <= dayEnd && m.end_date >= dayStart;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-100 text-green-800 border-green-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      case "used":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "confirmed":
        return "Confirmada";
      case "cancelled":
        return "Cancelada";
      case "used":
        return "Usada";
      default:
        return status;
    }
  };

  const getMaintenanceStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "in_progress":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "completed":
        return "bg-gray-100 text-gray-800 border-gray-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-orange-100 text-orange-800 border-orange-200";
    }
  };

  const getMaintenanceStatusLabel = (status: string) => {
    switch (status) {
      case "scheduled":
        return "Agendada";
      case "in_progress":
        return "Em Andamento";
      case "completed":
        return "Concluída";
      case "cancelled":
        return "Cancelada";
      default:
        return status;
    }
  };

  return (
    <EmployeeDashboardLayout>
      <div className="container py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Calendário de Reservas</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={previousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-lg font-medium min-w-[200px] text-center">
              {monthNames[month]} {year}
            </span>
            <Button variant="outline" size="icon" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Legenda */}
        <div className="mb-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-100 border border-green-200"></div>
            <span>Confirmada</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-100 border border-blue-200"></div>
            <span>Usada</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-100 border border-red-200"></div>
            <span>Cancelada</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-orange-100 border border-orange-200"></div>
            <span>Manutenção</span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {/* Headers dos dias da semana */}
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
              <div key={day} className="text-center font-semibold py-2 text-sm">
                {day}
              </div>
            ))}

            {/* Espaços vazios antes do primeiro dia */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[120px]" />
            ))}

            {/* Dias do mês */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayReservations = getReservationsForDay(day);
              const dayMaintenances = getMaintenancesForDay(day);
              const isToday =
                day === new Date().getDate() &&
                month === new Date().getMonth() &&
                year === new Date().getFullYear();

              return (
                <Card
                  key={day}
                  className={`min-h-[100px] md:min-h-[140px] p-1 md:p-2 ${
                    isToday ? "border-primary border-2" : ""
                  }`}
                >
                  <div className="font-semibold text-xs md:text-sm mb-1">{day}</div>
                  <div className="space-y-0.5 md:space-y-1">
                    {/* Manutenções */}
                    {dayMaintenances.map((maintenance: any) => (
                      <div
                        key={`maintenance-${maintenance.id}`}
                        className={`text-[10px] md:text-xs p-1 rounded border-2 ${getMaintenanceStatusColor(
                          maintenance.status
                        )}`}
                      >
                        <div className="flex items-center gap-1">
                          <Wrench className="h-2.5 w-2.5 md:h-3 md:w-3 flex-shrink-0" />
                          <span className="font-medium text-[9px] md:text-[10px]">Manutenção</span>
                        </div>
                        <div className="font-medium leading-tight break-words">{maintenance.vessel_name}</div>
                        <div className="text-[9px] md:text-[10px]">
                          {getMaintenanceStatusLabel(maintenance.status)}
                        </div>
                      </div>
                    ))}

                    {/* Reservas */}
                    {dayReservations.length === 0 && dayMaintenances.length === 0 ? (
                      <p className="text-[10px] md:text-xs text-muted-foreground">Sem reservas</p>
                    ) : (
                      dayReservations.map((reservation) => (
                        <div
                          key={reservation.id}
                          className={`text-[10px] md:text-xs p-1 rounded border-2 ${getStatusColor(
                            reservation.status
                          )}`}
                        >
                          <div className="font-bold leading-tight break-words">
                            {reservation.client_name}
                          </div>
                          <div className="font-medium leading-tight break-words">{reservation.vessel_name}</div>
                          <div className="text-[9px] md:text-[10px]">
                            {getStatusLabel(reservation.status)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </EmployeeDashboardLayout>
  );
}
