import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, ExternalLink, Fuel, RefreshCw, Trash2 } from "lucide-react";

interface FuelRecordCardProps {
  record: any;
  isSelected: boolean;
  onToggleSelect: () => void;
  onSyncWithAsaas: () => void;
  isSyncing: boolean;
  onMarkAsPaid: () => void;
  onDelete: () => void;
}

export function FuelRecordCard({
  record,
  isSelected,
  onToggleSelect,
  onSyncWithAsaas,
  isSyncing,
  onMarkAsPaid,
  onDelete,
}: FuelRecordCardProps) {
  return (
    <Card className={isSelected ? 'ring-2 ring-primary' : ''}>
      <CardHeader className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggleSelect}
              className="mt-1 flex-shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Fuel className="w-5 h-5 text-primary flex-shrink-0" />
                <CardTitle className="text-base sm:text-lg truncate">{record.vesselName}</CardTitle>
                <span className="bg-primary/20 text-primary text-xs font-bold px-2 py-0.5 rounded flex-shrink-0">
                  Galão {record.gallonNumber || 1}
                </span>
              </div>
              <CardDescription className="mt-1 text-xs sm:text-sm break-words">
                {record.clientName} • {new Date(record.date).toLocaleDateString('pt-BR')}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-lg font-bold text-primary">R$ {record.total_cost?.toFixed(2)}</span>
            <div className="flex gap-1">
              {/* Ocultar botões de sync/pagamento para abastecimentos operacionais */}
              {!record.is_operational && record.payment_status === 'pending' && !record.asaas_charge_id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSyncWithAsaas}
                  disabled={isSyncing}
                  title="Sincronizar com Asaas"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                </Button>
              )}
              {!record.is_operational && (record.payment_status === 'pending' || record.payment_status === 'overdue') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMarkAsPaid}
                  title="Recebido em Dinheiro"
                >
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </Button>
              )}
              {!record.is_operational && record.asaas_charge_id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(`https://www.asaas.com/cobrancas/${record.asaas_charge_id}`, '_blank')}
                  title="Ver cobrança no Asaas"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="h-8 w-8 p-0"
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Litros:</span>
            <span className="font-medium ml-1">{record.liters?.toFixed(2)} L</span>
          </div>
          <div>
            <span className="text-muted-foreground">Preço/L:</span>
            <span className="font-medium ml-1">R$ {record.price_per_liter?.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Subtotal:</span>
            <span className="font-medium ml-1">R$ {(record.liters * record.price_per_liter)?.toFixed(2)}</span>
          </div>
          {/* Ocultar status de pagamento para abastecimentos operacionais */}
          {!record.is_operational && (
            <div>
              <span className="text-muted-foreground">Status:</span>
              <span className={`ml-1 font-medium ${
                record.payment_status === 'paid' ? 'text-green-600' :
                record.payment_status === 'overdue' ? 'text-red-600' :
                'text-yellow-600'
              }`}>
                {record.payment_status === 'paid' ? '✓ Pago' :
                 record.payment_status === 'overdue' ? '⚠️ Vencido' :
                 '⏳ Pendente'}
              </span>
              {record.asaas_charge_id && (
                <span className="ml-1 text-xs text-muted-foreground">Asaas OK</span>
              )}
            </div>
          )}
        </div>

        {/* Detalhes de pesagem */}
        {record.weight_full && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm font-medium mb-2">⚖️ Abastecimento por Pesagem</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Litros Iniciais:</span>
                <span className="font-medium ml-1">{record.liters_initial?.toFixed(2)} L</span>
              </div>
              <div>
                <span className="text-muted-foreground">Peso Cheio:</span>
                <span className="font-medium ml-1">{record.weight_full?.toFixed(2)} kg</span>
              </div>
              <div>
                <span className="text-muted-foreground">Peso Após:</span>
                <span className="font-medium ml-1">{record.weight_after?.toFixed(2)} kg</span>
              </div>
              <div>
                <span className="text-muted-foreground">Consumido:</span>
                <span className="font-medium ml-1">{(record.weight_full - record.weight_after)?.toFixed(2)} kg</span>
              </div>
            </div>
            <p className="text-xs mt-2 text-muted-foreground">
              📊 Litros Calculados: {record.liters?.toFixed(2)} L
            </p>
            {(record.photo_before_url || record.photo_after_url) && (
              <div className="flex gap-2 mt-2">
                {record.photo_before_url && (
                  <Button variant="outline" size="sm" onClick={() => window.open(record.photo_before_url, '_blank')}>
                    📷 Ver Foto ANTES
                  </Button>
                )}
                {record.photo_after_url && (
                  <Button variant="outline" size="sm" onClick={() => window.open(record.photo_after_url, '_blank')}>
                    📷 Ver Foto DEPOIS
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {record.notes && (
          <div className="mt-2 text-xs text-muted-foreground italic border-t pt-2">
            {record.notes}
          </div>
        )}
        <div className="mt-2 text-xs text-muted-foreground border-t pt-2">
          Registrado por: {record.recorded_by_name || 'Sistema'} • {record.recorded_at ? new Date(record.recorded_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Data não disponível'}
        </div>
      </CardContent>
    </Card>
  );
}
