import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Componente que redireciona usuários para o dashboard correto baseado em seu role
 * - admin → /admin
 * - employee → /employee/reservas
 * - user → /dashboard
 */
export default function RoleRedirect() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading || !user) return;

    // Redirecionar baseado no role
    if (user.role === "admin") {
      setLocation("/admin");
    } else if (user.role === "employee") {
      setLocation("/employee/reservas");
    } else {
      setLocation("/dashboard");
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return null;
}
