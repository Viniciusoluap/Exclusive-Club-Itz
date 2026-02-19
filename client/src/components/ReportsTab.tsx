import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, DollarSign, TrendingUp, AlertCircle, BarChart3 } from "lucide-react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function ReportsTab() {
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: financial, isLoading: loadingFinancial } = trpc.reports.financial.useQuery({
    startDate,
    endDate,
  });

  const { data: executive, isLoading: loadingExecutive } = trpc.reports.executive.useQuery();

  if (loadingFinancial || loadingExecutive) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros de Período */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Selecione o período para análise</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Data Início</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Data Fim</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const now = new Date();
                  setStartDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
                  setEndDate(now.toISOString().split('T')[0]);
                }}
              >
                Últimos 30 dias
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const now = new Date();
                  setStartDate(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
                  setEndDate(now.toISOString().split('T')[0]);
                }}
              >
                Últimos 90 dias
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs por Categoria */}
      <Tabs defaultValue="executive" className="space-y-4">
        <TabsList>
          <TabsTrigger value="executive">
            <AlertCircle className="h-4 w-4 mr-2" />
            Dashboard Executivo
          </TabsTrigger>
          <TabsTrigger value="financial">
            <DollarSign className="h-4 w-4 mr-2" />
            Relatório Financeiro
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Executivo */}
        <TabsContent value="executive" className="space-y-4">
          {/* Scorecard */}
          <Card>
            <CardHeader>
              <CardTitle>Scorecard Geral</CardTitle>
              <CardDescription>Indicador de saúde do negócio (0-100)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="text-6xl font-bold" style={{
                  color: (executive?.score ?? 0) >= 80 ? '#10b981' : (executive?.score ?? 0) >= 60 ? '#f59e0b' : '#ef4444'
                }}>
                  {executive?.score ?? 0}
                </div>
                <div>
                  <div className="text-2xl font-semibold">{executive?.scoreLabel ?? 'N/A'}</div>
                  <div className="text-sm text-muted-foreground">
                    {(executive?.score ?? 0) >= 80 ? 'Operação saudável' :
                     (executive?.score ?? 0) >= 60 ? 'Atenção necessária' :
                     (executive?.score ?? 0) >= 40 ? 'Ação requerida' : 'Situação crítica'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alertas Críticos */}
          <Card>
            <CardHeader>
              <CardTitle>Alertas Críticos</CardTitle>
              <CardDescription>Situações que requerem atenção imediata</CardDescription>
            </CardHeader>
            <CardContent>
              {executive?.alerts && executive.alerts.length > 0 ? (
                <div className="space-y-3">
                  {executive.alerts.map((alert, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border-l-4 ${
                        alert.type === 'critical' ? 'border-red-500 bg-red-50' :
                        alert.type === 'warning' ? 'border-yellow-500 bg-yellow-50' :
                        'border-blue-500 bg-blue-50'
                      }`}
                    >
                      <div className="font-semibold">{alert.title}</div>
                      <div className="text-sm text-muted-foreground">{alert.message}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  ✅ Nenhum alerta crítico no momento
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Relatório Financeiro */}
        <TabsContent value="financial" className="space-y-4">
          {/* Cards de Métricas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  R$ {financial?.totalRevenue.toFixed(2) || "0,00"}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  R$ {financial?.avgTicket.toFixed(2) || "0,00"}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Taxa de Inadimplência</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {financial?.defaultRate.toFixed(1) || "0"}%
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Combustível vs Receita</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {financial?.fuelVsRevenue.toFixed(1) || "0"}%
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Receita por Embarcação */}
          <Card>
            <CardHeader>
              <CardTitle>Receita por Embarcação</CardTitle>
              <CardDescription>Distribuição de receita entre embarcações</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={financial?.revenueByVessel || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="vesselName" />
                  <YAxis />
                  <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
                  <Legend />
                  <Bar dataKey="total" fill="#0088FE" name="Receita (R$)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Receita por Tipo de Cota */}
          <Card>
            <CardHeader>
              <CardTitle>Receita por Tipo de Cota</CardTitle>
              <CardDescription>Comparação entre cotas inteiras e meias cotas</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Cota Inteira', value: financial?.revenueByQuotaType.full || 0 },
                      { name: 'Meia Cota', value: financial?.revenueByQuotaType.half || 0 },
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {[0, 1].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Sazonalidade de Receita */}
          <Card>
            <CardHeader>
              <CardTitle>Sazonalidade de Receita</CardTitle>
              <CardDescription>Receita mensal ao longo do período</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={financial?.monthlyRevenue || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
                  <Legend />
                  <Line type="monotone" dataKey="total" stroke="#8884d8" name="Receita (R$)" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Projeções de Receita */}
          <Card>
            <CardHeader>
              <CardTitle>Projeções de Receita</CardTitle>
              <CardDescription>Estimativa baseada na média diária do período</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">30 dias</div>
                  <div className="text-2xl font-bold">
                    R$ {financial?.projections.days30.toFixed(2) || "0,00"}
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">60 dias</div>
                  <div className="text-2xl font-bold">
                    R$ {financial?.projections.days60.toFixed(2) || "0,00"}
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">90 dias</div>
                  <div className="text-2xl font-bold">
                    R$ {financial?.projections.days90.toFixed(2) || "0,00"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top 10 Clientes por LTV */}
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Clientes por LTV (Lifetime Value)</CardTitle>
              <CardDescription>Clientes com maior valor total gerado</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {financial?.clientLTV && financial.clientLTV.length > 0 ? (
                  financial.clientLTV.map((client, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-semibold">{client.clientName}</div>
                        <div className="text-sm text-muted-foreground">{client.clientEmail}</div>
                      </div>
                      <div className="text-lg font-bold text-green-600">
                        R$ {client.total.toFixed(2)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum dado disponível
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
