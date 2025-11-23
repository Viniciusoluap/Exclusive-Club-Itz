import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { APP_LOGO } from "@/const";
import { trpc } from "@/lib/trpc";
import { Mail, Loader2, CloudRain, Calendar, Bell, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function AdminEmails() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [lastResult, setLastResult] = useState<any>(null);

  // Mutations
  // @ts-ignore - tRPC types will be regenerated on server restart
  const sendDailyWeather = trpc.emails.sendDailyWeather.useMutation({
    onSuccess: (result: any) => {
      setLastResult(result);
      if (result.success) {
        toast.success(`Email enviado com sucesso! (${result.emailsSent} notificação)`);
      } else {
        toast.error(`Erro: ${result.errors.join(", ")}`);
      }
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  // @ts-ignore - tRPC types will be regenerated on server restart
  const checkRainAlerts = trpc.emails.checkRainAlerts.useMutation({
    onSuccess: (result: any) => {
      setLastResult(result);
      if (result.success) {
        if (result.emailsSent > 0) {
          toast.success(`Alerta enviado! ${result.emailsSent} notificação`);
        } else {
          toast.info(result.errors[0] || "Nenhum alerta detectado");
        }
      } else {
        toast.error(`Erro: ${result.errors.join(", ")}`);
      }
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  // @ts-ignore - tRPC types will be regenerated on server restart
  const sendTomorrowReminders = trpc.emails.sendTomorrowReminders.useMutation({
    onSuccess: (result: any) => {
      setLastResult(result);
      if (result.success) {
        if (result.emailsSent > 0) {
          toast.success(`Lembrete enviado! ${result.emailsSent} notificação`);
        } else {
          toast.info(result.errors[0] || "Nenhuma reserva para amanhã");
        }
      } else {
        toast.error(`Erro: ${result.errors.join(", ")}`);
      }
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Acesso Negado
            </CardTitle>
            <CardDescription>Apenas administradores podem acessar esta página</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/">Voltar para Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-white">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-sm shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <img src={APP_LOGO} alt="Exclusive Club" className="h-10 w-10 object-contain" />
              <span className="font-bold text-xl hidden sm:inline">Exclusive Club</span>
            </Link>

            <div className="flex items-center gap-4">
              <Link href="/admin">
                <Button variant="outline" size="sm">
                  Voltar ao Admin
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Mail className="h-8 w-8 text-cyan-600" />
            Sistema de Emails Automáticos
          </h1>
          <p className="text-gray-600 mt-2">
            Envie notificações com previsão do tempo e alertas para reservas
          </p>
        </div>

        {/* Info Alert */}
        <Alert className="mb-6">
          <Bell className="h-4 w-4" />
          <AlertTitle>Como funciona</AlertTitle>
          <AlertDescription>
            Os emails são enviados como notificações para o administrador (você) via sistema Manus.
            Você receberá as informações e poderá entrar em contato com os clientes conforme necessário.
          </AlertDescription>
        </Alert>

        {/* Last Result */}
        {lastResult && (
          <Alert className={`mb-6 ${lastResult.success ? "border-green-500" : "border-red-500"}`}>
            {lastResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
            <AlertTitle>
              {lastResult.success ? "Sucesso!" : "Erro"}
            </AlertTitle>
            <AlertDescription>
              {lastResult.success
                ? `${lastResult.emailsSent} notificação(ões) enviada(s)`
                : lastResult.errors.join(", ")}
            </AlertDescription>
          </Alert>
        )}

        {/* Email Actions */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Daily Weather */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CloudRain className="h-5 w-5 text-cyan-600" />
                Previsão do Dia
              </CardTitle>
              <CardDescription>
                Envia previsão do tempo para reservas de hoje
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-gray-600">
                <p className="mb-2">📧 Inclui:</p>
                <ul className="space-y-1 ml-4">
                  <li>• Lista de reservas confirmadas</li>
                  <li>• Temperatura e condições</li>
                  <li>• Probabilidade de chuva</li>
                  <li>• Status de navegação</li>
                </ul>
              </div>
              <Button
                className="w-full"
                onClick={() => sendDailyWeather.mutate()}
                disabled={sendDailyWeather.isPending}
              >
                {sendDailyWeather.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Enviar Agora
                  </>
                )}
              </Button>
              <p className="text-xs text-gray-500">
                💡 Recomendado: executar diariamente às 08:00
              </p>
            </CardContent>
          </Card>

          {/* Rain Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                Alertas de Chuva
              </CardTitle>
              <CardDescription>
                Verifica alertas para próximos 5 dias
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-gray-600">
                <p className="mb-2">⚠️ Detecta:</p>
                <ul className="space-y-1 ml-4">
                  <li>• Chuva &gt;80% (crítico)</li>
                  <li>• Ventos fortes &gt;25 km/h</li>
                  <li>• Reservas em risco</li>
                  <li>• Contatos dos clientes</li>
                </ul>
              </div>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => checkRainAlerts.mutate()}
                disabled={checkRainAlerts.isPending}
              >
                {checkRainAlerts.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    <CloudRain className="mr-2 h-4 w-4" />
                    Verificar Alertas
                  </>
                )}
              </Button>
              <p className="text-xs text-gray-500">
                💡 Recomendado: executar 2x ao dia
              </p>
            </CardContent>
          </Card>

          {/* Tomorrow Reminders */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                Lembretes de Amanhã
              </CardTitle>
              <CardDescription>
                Envia lembrete para reservas de amanhã
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-gray-600">
                <p className="mb-2">📅 Inclui:</p>
                <ul className="space-y-1 ml-4">
                  <li>• Lista de reservas</li>
                  <li>• Previsão do tempo</li>
                  <li>• Checklist de preparação</li>
                  <li>• Recomendações</li>
                </ul>
              </div>
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => sendTomorrowReminders.mutate()}
                disabled={sendTomorrowReminders.isPending}
              >
                {sendTomorrowReminders.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Bell className="mr-2 h-4 w-4" />
                    Enviar Lembrete
                  </>
                )}
              </Button>
              <p className="text-xs text-gray-500">
                💡 Recomendado: executar às 18:00
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>📋 Instruções de Uso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Rotina Diária Recomendada:</h4>
              <ol className="space-y-2 text-sm text-gray-600 ml-4">
                <li>1. <strong>08:00</strong> - Clique em "Previsão do Dia" para receber informações das reservas de hoje</li>
                <li>2. <strong>09:00 e 15:00</strong> - Clique em "Verificar Alertas" para monitorar condições futuras</li>
                <li>3. <strong>18:00</strong> - Clique em "Lembretes de Amanhã" para se preparar para o próximo dia</li>
              </ol>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-900">
                <strong>💡 Dica:</strong> Você receberá as notificações no seu painel Manus. 
                Use as informações para entrar em contato com os clientes via WhatsApp, email ou telefone.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
