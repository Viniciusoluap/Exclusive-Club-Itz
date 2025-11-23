import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Calendar, Loader2, Star } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { MobileMenu } from "@/components/MobileMenu";

export default function MinhasReservas() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const utils = trpc.useUtils();

  // @ts-ignore
  const { data: bookings, isLoading: bookingsLoading } = trpc.bookings.myBookings.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // @ts-ignore
  const createReview = trpc.reviews.create.useMutation({
    onSuccess: () => {
      toast.success("Avaliação enviada! Aguarde aprovação do administrador.");
      setShowReviewDialog(false);
      setSelectedBooking(null);
      setRating(0);
      setComment("");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const handleReview = (booking: any) => {
    setSelectedBooking(booking);
    setRating(0);
    setComment("");
    setShowReviewDialog(true);
  };

  const submitReview = () => {
    if (rating === 0) {
      toast.error("Por favor, selecione uma avaliação");
      return;
    }

    createReview.mutate({
      bookingId: selectedBooking.id,
      vesselId: selectedBooking.vesselId,
      vesselName: selectedBooking.vesselName,
      rating,
      comment: comment || undefined,
    });
  };

  const renderStars = (currentRating: number, interactive: boolean = false) => {
    return Array.from({ length: 5 }).map((_, i) => (
      <Star
        key={i}
        className={`h-6 w-6 ${interactive ? "cursor-pointer" : ""} ${
          i < currentRating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
        }`}
        onClick={() => interactive && setRating(i + 1)}
      />
    ));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>
              Você precisa estar logado para ver suas reservas
            </CardDescription>
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

  const isPastBooking = (date: string) => {
    return new Date(date) < new Date();
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer">
                <img src={APP_LOGO} alt="Exclusive Club" className="h-12 w-12" />
                <span className="text-xl font-bold text-primary">Exclusive Club</span>
              </div>
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/">
                <a className="text-foreground hover:text-primary transition-colors">Home</a>
              </Link>
              <Link href="/reservas">
                <a className="text-foreground hover:text-primary transition-colors">Fazer Reserva</a>
              </Link>
              {isAuthenticated && (
                <Button variant="ghost" onClick={handleLogout}>
                  Sair
                </Button>
              )}
            </nav>
            <MobileMenu isAuthenticated={isAuthenticated} onLogout={handleLogout} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-12">
        <div className="container">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Minhas Reservas</h1>
            <p className="text-gray-600">Histórico de todas as suas reservas</p>
          </div>

          {bookingsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !bookings || bookings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Nenhuma reserva encontrada
                </h3>
                <p className="text-gray-600 mb-6">
                  Você ainda não fez nenhuma reserva
                </p>
                <Button asChild>
                  <Link href="/reservas">Fazer Primeira Reserva</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6">
              {bookings.map((booking: any) => (
                <Card key={booking.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{booking.vesselName}</CardTitle>
                        <CardDescription>
                          {new Date(booking.date).toLocaleDateString("pt-BR", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </CardDescription>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          booking.status === "confirmed"
                            ? "bg-green-100 text-green-800"
                            : booking.status === "cancelled"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {booking.status === "confirmed"
                          ? "Confirmada"
                          : booking.status === "cancelled"
                          ? "Cancelada"
                          : "Pendente"}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-600">
                        <p>
                          <strong>Cliente:</strong> {booking.clientName}
                        </p>
                        <p>
                          <strong>Email:</strong> {booking.clientEmail}
                        </p>
                        {booking.clientPhone && (
                          <p>
                            <strong>Telefone:</strong> {booking.clientPhone}
                          </p>
                        )}
                      </div>
                      {isPastBooking(booking.date) &&
                        booking.status === "confirmed" && (
                          <Button
                            onClick={() => handleReview(booking)}
                            variant="outline"
                            size="sm"
                          >
                            <Star className="h-4 w-4 mr-2" />
                            Avaliar
                          </Button>
                        )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avaliar Experiência</DialogTitle>
            <DialogDescription>
              Como foi sua experiência com {selectedBooking?.vesselName}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Avaliação (1-5 estrelas)
              </label>
              <div className="flex gap-2">{renderStars(rating, true)}</div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Comentário (opcional)
              </label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Conte-nos sobre sua experiência..."
                rows={4}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowReviewDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={submitReview} disabled={createReview.isPending}>
                {createReview.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Enviar Avaliação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
