import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageLoader } from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Fuel, ExternalLink, DollarSign, TrendingUp, AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

const MONTHS = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

const YEARS = ["2025", "2026", "2027"];

export default function MeusAbastecimentos() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");

  const queryInput = {
    types: ["fuel" as const],
    ...(selectedYear !== "all" && selectedMonth !== "all"
      ? { year: parseInt(selectedYear), month: parseInt(selectedMonth) }
      : selectedYear !== "all"
      ? { year: parseInt(selectedYear) }
      : {}),
  };

  const { data, isLoading } = trpc.bpo.getMyCharges.useQuery(queryInput, {
    enabled: !!user,
  });

  const charges = data?.charges ?? [];

  if (authLoading || isLoading) {
    return <PageLoader />;
  }

  if (!user) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="py-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Faça login para ver seus abastecimentos</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPaid = (s: string) => ["received", "confirmed", "receivedInCash"].includes(s);
  const isPending = (s: string) => s === "pending";
  const isOverdue = (s: string) => s === "overdue";

  const totalPending = charges
    .filter((c) => isPending(c.status) || isOverdue(c.status))
    .reduce((sum, c) => sum + parseFloat(c.value), 0);

  const totalPaid = charges
    .filter((c) => isPaid(c.status))
    .reduce((sum, c) => sum + parseFloat(c.value), 0);

  const getStatusBadge = (status: string) => {
    if (isPaid(status))
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">✓ Pago</Badge>;
    if (isOverdue(status))
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">⚠ Vencido</Badge>;
    if (isPending(status))
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">⏳ Pendente</Badge>;
    if (status === "refunded")
      return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">↩ Estornado</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header com botão Voltar */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold">Meus Abastecimentos</h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe seus abastecimentos e pagamentos
          </p>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Mês</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Ano</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cards de Resumo */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total a Pagar</CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                R$ {totalPending.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">Pagamentos pendentes e vencidos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Pago</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                R$ {totalPaid.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">Pagamentos confirmados</p>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Abastecimentos */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Histórico</h2>

          {charges.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhum abastecimento encontrado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {charges.map((charge) => {
                const paymentUrl = charge.paymentLink || charge.invoiceUrl;
                const canPay =
                  (isPending(charge.status) || isOverdue(charge.status)) && paymentUrl;

                return (
                  <Card key={charge.id}>
                    <CardHeader className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <Fuel className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-base sm:text-lg leading-tight">
                              {charge.description || "Abastecimento"}
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                              Vencimento:{" "}
                              {charge.dueDate
                                ? new Date(charge.dueDate + "T00:00:00").toLocaleDateString("pt-BR")
                                : "—"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:items-start gap-3 sm:gap-4">
                          <div className="text-left sm:text-right flex-1">
                            <div className="text-xl sm:text-2xl font-bold text-primary">
                              R$ {parseFloat(charge.value).toFixed(2)}
                            </div>
                            <div className="mt-2">{getStatusBadge(charge.status)}</div>
                            {charge.paidDate && (
                              <div className="text-xs text-green-600 mt-1">
                                Pago em:{" "}
                                {new Date(charge.paidDate + "T00:00:00").toLocaleDateString("pt-BR")}
                              </div>
                            )}
                          </div>

                          {canPay && (
                            <Button
                              onClick={() => window.open(paymentUrl!, "_blank")}
                              className="whitespace-nowrap"
                            >
                              <DollarSign className="w-4 h-4 mr-1" />
                              Pagar
                            </Button>
                          )}

                          {isPaid(charge.status) && (charge.receiptUrl || charge.invoiceUrl) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open((charge.receiptUrl || charge.invoiceUrl)!, "_blank")}
                              className="whitespace-nowrap"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Comprovante
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
