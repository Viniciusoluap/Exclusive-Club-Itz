/**
 * Dashboard Admin - Classificação de Cobranças BPO
 * Classifique cobranças importadas do Asaas que ainda não foram categorizadas.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ChevronLeft, ChevronRight, Tag, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function Pagamentos() {
  const [, setLocation] = useLocation();
  const [bpoPage, setBpoPage] = useState(0);
  const BPO_PAGE_SIZE = 20;

  const bpoUnclassifiedQuery = trpc.bpo.listUnclassified.useQuery({
    limit: BPO_PAGE_SIZE,
    offset: bpoPage * BPO_PAGE_SIZE,
  });

  const bpoImportMutation = trpc.bpo.importFromAsaas.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Importação concluída: ${data.inserted ?? 0} inseridas, ${data.updated ?? 0} atualizadas`);
      bpoUnclassifiedQuery.refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro na importação: ${error.message}`);
    },
  });

  const bpoClassifyMutation = trpc.bpo.manualClassify.useMutation({
    onSuccess: () => {
      toast.success("Cobrança classificada!");
      bpoUnclassifiedQuery.refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao classificar: ${error.message}`);
    },
  });

  const formatCurrency = (value: string | number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      typeof value === "string" ? parseFloat(value) : value
    );

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <div className="border-b bg-white sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/saas")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base md:text-xl font-bold truncate">Classificação de Cobranças BPO</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* BPO Unclassified */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-yellow-500" />
                Cobranças Não Classificadas
              </CardTitle>
              <CardDescription>
                {bpoUnclassifiedQuery.data?.total ?? 0} cobrança(s) aguardando classificação
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bpoImportMutation.mutate()}
              disabled={bpoImportMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${bpoImportMutation.isPending ? "animate-spin" : ""}`} />
              Reimportar do Asaas
            </Button>
          </CardHeader>
          <CardContent>
            {bpoUnclassifiedQuery.isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : !bpoUnclassifiedQuery.data?.charges?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <Tag className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="font-medium">Nenhuma cobrança pendente de classificação</p>
                <p className="text-sm mt-1">Todas as cobranças já foram classificadas ou o banco está vazio.</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Classificar como</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bpoUnclassifiedQuery.data.charges.map((charge: any) => (
                      <TableRow key={charge.id}>
                        <TableCell className="max-w-[200px]">
                          <p className="truncate text-sm">{charge.description || <span className="text-muted-foreground italic">Sem descrição</span>}</p>
                          {charge.externalReference && (
                            <p className="text-xs text-muted-foreground truncate">Ref: {charge.externalReference}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <p className="truncate max-w-[150px]">{charge.clientName || charge.clientEmail || <span className="text-muted-foreground italic">Desconhecido</span>}</p>
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {formatCurrency(charge.value)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {charge.dueDate ? new Date(charge.dueDate + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell>
                          {charge.status === "received" || charge.status === "confirmed" || charge.status === "receivedInCash" ? (
                            <Badge className="bg-green-100 text-green-800 text-xs">Pago</Badge>
                          ) : charge.status === "overdue" ? (
                            <Badge className="bg-red-100 text-red-800 text-xs">Vencido</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">{charge.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            onValueChange={(value) =>
                              bpoClassifyMutation.mutate({ chargeId: charge.id, type: value as any })
                            }
                          >
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                              <SelectValue placeholder="Selecionar..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="monthly">Mensalidade</SelectItem>
                              <SelectItem value="fuel">Abastecimento</SelectItem>
                              <SelectItem value="repair">Reparo</SelectItem>
                              <SelectItem value="quota_sale">Venda de Cota</SelectItem>
                              <SelectItem value="other">Outro</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Paginação */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {bpoPage * BPO_PAGE_SIZE + 1}–{Math.min((bpoPage + 1) * BPO_PAGE_SIZE, bpoUnclassifiedQuery.data?.total ?? 0)} de {bpoUnclassifiedQuery.data?.total ?? 0}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBpoPage((p) => Math.max(0, p - 1))}
                      disabled={bpoPage === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBpoPage((p) => p + 1)}
                      disabled={(bpoPage + 1) * BPO_PAGE_SIZE >= (bpoUnclassifiedQuery.data?.total ?? 0)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
