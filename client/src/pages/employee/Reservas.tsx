import EmployeeDashboardLayout from "@/components/EmployeeDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Calendar, User, Ship, FileText } from "lucide-react";

export default function EmployeeReservas() {
  // Buscar próximas reservas confirmadas (hoje + futuras)
  const { data: upcomingReservations, isLoading } = trpc.employee.upcomingReservations.useQuery();

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });
  };

  const isToday = (timestamp: number) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bookingDate = new Date(timestamp);
    bookingDate.setHours(0, 0, 0, 0);
    return bookingDate.getTime() === today.getTime();
  };

  return (
    <EmployeeDashboardLayout>
      <div className="container py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Próximas Reservas</h1>
          <p className="text-muted-foreground">
            Visualize as reservas confirmadas de hoje e as próximas 20 reservas futuras
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !upcomingReservations || upcomingReservations.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma reserva confirmada encontrada</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {upcomingReservations.map((reservation: any) => (
              <Card
                key={reservation.id}
                className={isToday(reservation.bookingDate) ? "border-primary border-2" : ""}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      {formatDate(reservation.bookingDate)}
                      {isToday(reservation.bookingDate) && (
                        <span className="text-sm font-normal bg-primary text-primary-foreground px-2 py-1 rounded">
                          Hoje
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-normal bg-green-100 text-green-800 px-3 py-1 rounded">
                      Confirmada
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-start gap-3">
                      <Ship className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Embarcação</p>
                        <p className="font-medium">{reservation.vesselName}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Cliente</p>
                        <p className="font-medium">{reservation.clientName}</p>
                      </div>
                    </div>
                    {reservation.notes && (
                      <div className="flex items-start gap-3 md:col-span-3">
                        <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm text-muted-foreground">Observações</p>
                          <p className="font-medium">{reservation.notes}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {upcomingReservations && upcomingReservations.length > 0 && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Exibindo {upcomingReservations.length} reserva(s) confirmada(s)
          </div>
        )}
      </div>
    </EmployeeDashboardLayout>
  );
}
