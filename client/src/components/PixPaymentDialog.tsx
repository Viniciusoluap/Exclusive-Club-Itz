/**
 * Dialog de Pagamento PIX
 * 
 * Componente reutilizável para exibir QR Code PIX e código copia-e-cola
 * com contador de expiração e status em tempo real.
 */
import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Check, Clock, QrCode, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

interface PixPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId?: number;
  asaasPaymentId?: string;
  pixQrCode?: string | null;
  pixCopyPaste?: string | null;
  pixExpirationDate?: string | null;
  value: number;
  description?: string;
  onPaymentConfirmed?: () => void;
  onPaymentExpired?: () => void;
}

export function PixPaymentDialog({
  open,
  onOpenChange,
  paymentId,
  asaasPaymentId,
  pixQrCode,
  pixCopyPaste,
  pixExpirationDate,
  value,
  description,
  onPaymentConfirmed,
  onPaymentExpired,
}: PixPaymentDialogProps) {
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [status, setStatus] = useState<'pending' | 'confirmed' | 'expired'>('pending');

  // Status é atualizado via webhook do Asaas — sem polling ativo

  // Calcula tempo restante até expiração
  useEffect(() => {
    if (!pixExpirationDate) {
      // Se não tem data de expiração, assume 30 minutos
      setTimeLeft(30 * 60);
      return;
    }

    const calculateTimeLeft = () => {
      const expiration = new Date(pixExpirationDate).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expiration - now) / 1000));
      setTimeLeft(diff);

      if (diff === 0 && status === 'pending') {
        setStatus('expired');
        onPaymentExpired?.();
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [pixExpirationDate, status, onPaymentExpired]);

  // Copia código PIX para clipboard
  const handleCopy = useCallback(async () => {
    if (!pixCopyPaste) return;

    try {
      await navigator.clipboard.writeText(pixCopyPaste);
      setCopied(true);
      toast.success("Código PIX copiado!");
      setTimeout(() => setCopied(false), 3000);
    } catch (error) {
      toast.error("Erro ao copiar código");
    }
  }, [pixCopyPaste]);

  // Formata tempo restante
  const formatTimeLeft = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Formata valor em reais
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Pagamento via PIX
          </DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {/* Status Badge */}
          {status === 'confirmed' && (
            <Badge variant="default" className="bg-green-500 text-white">
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Pagamento Confirmado!
            </Badge>
          )}
          {status === 'expired' && (
            <Badge variant="destructive">
              <XCircle className="h-4 w-4 mr-1" />
              PIX Expirado
            </Badge>
          )}
          {status === 'pending' && timeLeft !== null && (
            <Badge variant="outline" className="text-orange-600 border-orange-300">
              <Clock className="h-4 w-4 mr-1" />
              Expira em {formatTimeLeft(timeLeft)}
            </Badge>
          )}

          {/* Valor */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Valor a pagar</p>
            <p className="text-3xl font-bold text-primary">{formatCurrency(value)}</p>
          </div>

          {/* QR Code */}
          {status === 'pending' && pixQrCode && (
            <div className="bg-white p-4 rounded-lg border">
              <img
                src={`data:image/png;base64,${pixQrCode}`}
                alt="QR Code PIX"
                className="w-48 h-48"
              />
            </div>
          )}

          {status === 'confirmed' && (
            <div className="bg-green-50 p-8 rounded-lg border border-green-200">
              <CheckCircle2 className="h-24 w-24 text-green-500 mx-auto" />
            </div>
          )}

          {status === 'expired' && (
            <div className="bg-red-50 p-8 rounded-lg border border-red-200">
              <XCircle className="h-24 w-24 text-red-500 mx-auto" />
            </div>
          )}

          {/* Código Copia e Cola */}
          {status === 'pending' && pixCopyPaste && (
            <div className="w-full space-y-2">
              <p className="text-sm text-muted-foreground text-center">
                Ou copie o código PIX:
              </p>
              <div className="flex gap-2">
                <div className="flex-1 bg-muted p-3 rounded-md text-xs font-mono break-all max-h-20 overflow-y-auto">
                  {pixCopyPaste}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                  aria-label="Copiar código PIX"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Instruções */}
          {status === 'pending' && (
            <div className="text-sm text-muted-foreground text-center space-y-1">
              <p>1. Abra o app do seu banco</p>
              <p>2. Escaneie o QR Code ou cole o código</p>
              <p>3. Confirme o pagamento</p>
            </div>
          )}

          {/* Status atualizado via webhook do Asaas */}

          {/* Mensagem de sucesso */}
          {status === 'confirmed' && (
            <div className="text-center space-y-2">
              <p className="text-green-600 font-medium">
                Seu pagamento foi confirmado com sucesso!
              </p>
              <p className="text-sm text-muted-foreground">
                Você pode fechar esta janela.
              </p>
            </div>
          )}

          {/* Mensagem de expiração */}
          {status === 'expired' && (
            <div className="text-center space-y-2">
              <p className="text-red-600 font-medium">
                O código PIX expirou.
              </p>
              <p className="text-sm text-muted-foreground">
                Gere um novo código para continuar.
              </p>
            </div>
          )}
        </div>

        {/* Botões */}
        <div className="flex justify-end gap-2">
          {status === 'pending' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Pagar depois
            </Button>
          )}
          {(status === 'confirmed' || status === 'expired') && (
            <Button onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook para gerenciar estado do pagamento PIX
 */
export function usePixPayment() {
  const [isOpen, setIsOpen] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    paymentId?: number;
    asaasPaymentId?: string;
    pixQrCode?: string | null;
    pixCopyPaste?: string | null;
    pixExpirationDate?: string | null;
    value: number;
    description?: string;
  } | null>(null);

  const openPayment = useCallback((data: typeof paymentData) => {
    setPaymentData(data);
    setIsOpen(true);
  }, []);

  const closePayment = useCallback(() => {
    setIsOpen(false);
    setPaymentData(null);
  }, []);

  return {
    isOpen,
    paymentData,
    openPayment,
    closePayment,
    setIsOpen,
  };
}
