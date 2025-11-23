import * as db from "./db";

/**
 * Estatísticas e análises para clientes e admin
 */

export interface ClientStats {
  totalBookings: number;
  upcomingBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  favoriteVessel: string | null;
  monthlyUsage: { month: string; count: number }[];
}

/**
 * Calcula estatísticas de uso para um cliente
 */
export async function getClientStats(clientEmail: string): Promise<ClientStats> {
  const bookings = await db.getBookingsByEmail(clientEmail);
  
  const now = Date.now();
  const upcoming = bookings.filter(b => b.bookingDate > now && b.status !== 'cancelled');
  const completed = bookings.filter(b => b.bookingDate <= now && b.status !== 'cancelled');
  const cancelled = bookings.filter(b => b.status === 'cancelled');
  
  // Encontrar embarcação favorita
  const vesselCounts: Record<string, number> = {};
  completed.forEach(b => {
    vesselCounts[b.vesselName] = (vesselCounts[b.vesselName] || 0) + 1;
  });
  
  let favoriteVessel: string | null = null;
  let maxCount = 0;
  for (const [vessel, count] of Object.entries(vesselCounts)) {
    if (count > maxCount) {
      maxCount = count;
      favoriteVessel = vessel;
    }
  }
  
  // Uso mensal (últimos 6 meses)
  const monthlyUsage: { month: string; count: number }[] = [];
  const sixMonthsAgo = now - (6 * 30 * 24 * 60 * 60 * 1000);
  
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date();
    monthStart.setMonth(monthStart.getMonth() - i);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    
    const count = bookings.filter(b => 
      b.bookingDate >= monthStart.getTime() && 
      b.bookingDate < monthEnd.getTime() &&
      b.status !== 'cancelled'
    ).length;
    
    monthlyUsage.push({
      month: monthStart.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
      count
    });
  }
  
  return {
    totalBookings: bookings.length,
    upcomingBookings: upcoming.length,
    completedBookings: completed.length,
    cancelledBookings: cancelled.length,
    favoriteVessel,
    monthlyUsage,
  };
}

export interface AdminStats {
  totalBookings: number;
  totalClients: number;
  totalVessels: number;
  upcomingBookings: number;
  occupancyRate: { vesselName: string; rate: number }[];
  topClients: { clientName: string; bookingCount: number }[];
}

/**
 * Calcula estatísticas gerenciais para o admin
 */
export async function getAdminStats(): Promise<AdminStats> {
  const [clients, vessels] = await Promise.all([
    db.getAllowedClients(),
    db.getVessels(),
  ]);
  
  // Buscar todas as reservas de todos os clientes
  const allBookingsPromises = clients.map((c: any) => db.getBookingsByEmail(c.email));
  const allBookingsArrays = await Promise.all(allBookingsPromises);
  const allBookings = allBookingsArrays.flat();
  
  const now = Date.now();
  const upcoming = allBookings.filter((b: any) => b.bookingDate > now && b.status !== 'cancelled');
  
  // Taxa de ocupação por embarcação (próximos 30 dias)
  const thirtyDaysFromNow = now + (30 * 24 * 60 * 60 * 1000);
  const recentBookings = allBookings.filter((b: any) => 
    b.bookingDate >= now && 
    b.bookingDate <= thirtyDaysFromNow &&
    b.status !== 'cancelled'
  );
  
  const vesselBookingCounts: Record<string, number> = {};
  recentBookings.forEach((b: any) => {
    vesselBookingCounts[b.vesselName] = (vesselBookingCounts[b.vesselName] || 0) + 1;
  });
  
  const occupancyRate = vessels.map((v: any) => ({
    vesselName: v.name,
    rate: Math.round(((vesselBookingCounts[v.name] || 0) / 30) * 100) // % de dias ocupados
  }));
  
  // Top clientes
  const clientBookingCounts: Record<string, { name: string; count: number }> = {};
  allBookings.forEach((b: any) => {
    if (b.status !== 'cancelled') {
      if (!clientBookingCounts[b.clientEmail]) {
        clientBookingCounts[b.clientEmail] = { name: b.clientName, count: 0 };
      }
      clientBookingCounts[b.clientEmail].count++;
    }
  });
  
  const topClients = Object.values(clientBookingCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(c => ({ clientName: c.name, bookingCount: c.count }));
  
  return {
    totalBookings: allBookings.length,
    totalClients: clients.length,
    totalVessels: vessels.length,
    upcomingBookings: upcoming.length,
    occupancyRate,
    topClients,
  };
}
