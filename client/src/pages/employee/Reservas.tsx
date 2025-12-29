import EmployeeDashboardLayout from "@/components/EmployeeDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Calendar, User, Ship, FileText, Phone } from "lucide-react";

// Ícone do WhatsApp como componente SVG
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

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

  // Formatar telefone para link do WhatsApp
  const formatPhoneForWhatsApp = (phone: string | null | undefined): string | null => {
    if (!phone) return null;
    // Remove todos os caracteres não numéricos
    const cleanPhone = phone.replace(/\D/g, '');
    // Se não começar com 55 (código do Brasil), adiciona
    if (!cleanPhone.startsWith('55')) {
      return `55${cleanPhone}`;
    }
    return cleanPhone;
  };

  // Formatar telefone para exibição
  const formatPhoneForDisplay = (phone: string | null | undefined): string => {
    if (!phone) return 'Não cadastrado';
    return phone;
  };

  return (
    <EmployeeDashboardLayout>
      <div className="container py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Próximas Reservas</h1>
          <p className="text-muted-foreground">
            Visualize as reservas confirmadas de hoje (até 18h) e as próximas 20 reservas futuras
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
            {upcomingReservations.map((reservation: any) => {
              const whatsappPhone = formatPhoneForWhatsApp(reservation.clientPhone);
              // Mensagem pré-definida para confirmação de reserva
              const whatsappMessage = "Olá! Sou da Exclusive Club, gostaria de confirmar sua reserva para hoje e o horário que você quer descer?\nPara proporcionarmos o melhor atendimento para você";
              const whatsappUrl = whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}` : null;
              
              return (
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
                      <div className="flex items-start gap-3">
                        <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm text-muted-foreground">Telefone</p>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{formatPhoneForDisplay(reservation.clientPhone)}</p>
                            {whatsappUrl && (
                              <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-500 hover:bg-green-600 transition-colors"
                                title="Abrir WhatsApp"
                              >
                                <WhatsAppIcon className="w-5 h-5 text-white" />
                              </a>
                            )}
                          </div>
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
              );
            })}
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
