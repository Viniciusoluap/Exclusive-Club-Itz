import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, Fuel, TrendingUp, ArrowLeft, Trash2, FileText, Mail, DollarSign, AlertCircle, ExternalLink, Settings, RefreshCw, CheckCircle, XCircle, Clock, Banknote, Upload } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";
import FuelManagementDialog from "@/components/FuelManagementDialog";

// Interface para cada galão no abastecimento (múltiplos galões)
interface ContainerData {
  id: string;
  gallonNumber: number;
  litersInitial: string;
  weightFull: string;
  weightAfter: string;
  photoBeforeUrl: string;
  photoAfterUrl: string;
  photoBeforeFile: File | null;
  photoAfterFile: File | null;
}

export default function Abastecimento() {
  const utils = trpc.useUtils();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [liters, setLiters] = useState("");
  const [pricePerLiter, setPricePerLiter] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [isBudgetDialogOpen, setIsBudgetDialogOpen] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  
  // Estados para método de abastecimento por pesagem (modo antigo - galão único)
  const [useWeightMethod, setUseWeightMethod] = useState(false);
  const [litersInitial, setLitersInitial] = useState("");
  const [weightFull, setWeightFull] = useState("");
  const [weightAfter, setWeightAfter] = useState("");
  const [photoBefore, setPhotoBefore] = useState<File | null>(null);
  const [photoAfter, setPhotoAfter] = useState<File | null>(null);
  const [photoBeforeUrl, setPhotoBeforeUrl] = useState<string | null>(null);
  const [photoAfterUrl, setPhotoAfterUrl] = useState<string | null>(null);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  
  // Estado para seleção de galão (modo antigo)
  const [selectedGallon, setSelectedGallon] = useState<string>("1");
  
  // Estados para múltiplos galões (modo novo)
  const [useMultipleGallons, setUseMultipleGallons] = useState(false);
  const [containers, setContainers] = useState<ContainerData[]>([]);
  const [uploadingContainerPhotos, setUploadingContainerPhotos] = useState(false);
  
  // Estado para abastecimento operacional (custo da empresa)
  const [isOperational, setIsOperational] = useState(false);

  // Estado de filtro de mês/ano
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const currentMonthYear = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  const { data: recentBookings } = trpc.bookings.getRecent.useQuery({ onlyUsed: true });
  const {
    data: fuelRecords,
    error: fuelRecordsError,
    isLoading: fuelRecordsLoading,
    refetch,
  } = trpc.fuelRecords.list.useQuery({
    month: selectedMonth,
    year: selectedYear
  });
  const { data: vessels } = trpc.vessels.list.useQuery();
  const { data: financialStats } = trpc.fuelRecords.financialStats.useQuery({ monthYear: currentMonthYear });
  const { data: budget } = trpc.fuelBudget.get.useQuery({ monthYear: currentMonthYear });
  const { data: gallonStock, refetch: refetchGallonStock } = trpc.fuelPurchases.getGallonStock.useQuery();
  const { data: balanceData } = trpc.fuelBudget.getCurrentBalance.useQuery({ monthYear: currentMonthYear });

  // BPO: dados financeiros de cobranças de abastecimento
  const { data: bpoFuelStats } = trpc.bpo.getStats.useQuery(
    { year: String(selectedYear), type: 'fuel' },
    { enabled: true }
  );

  useEffect(() => {
    refetch();
  }, [selectedMonth, selectedYear]);

  console.log('[Abastecimento] recentBookings:', recentBookings);
  console.log('[Abastecimento] fuelRecords:', fuelRecords);
  console.log('[Abastecimento] vessels:', vessels);

  const createMutation = trpc.fuelRecords.create.useMutation({
    onSuccess: (data: any) => {
      const gallonsUsed = data.containersCount || 1;
      toast.success(`Abastecimento registrado com ${gallonsUsed} galão(ões)! Total: ${data.totalLiters?.toFixed(2) || data.liters?.toFixed(2) || 0}L - R$ ${data.totalCost?.toFixed(2) || 0}`);
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
      refetchGallonStock();
    },
    onError: (error: any) => {
      toast.error(`Erro ao registrar abastecimento: ${error.message}`);
    },
  });

  const deleteMutation = trpc.fuelRecords.delete.useMutation({
    onSuccess: () => {
      toast.success('Abastecimento excluído com sucesso!');
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao excluir abastecimento: ${error.message}`);
    },
  });

  const generateReportMutation = trpc.fuelRecords.generateReport.useMutation({
    onSuccess: (data: any) => {
      try {
        const byteCharacters = atob(data.pdf);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        
        const blobUrl = URL.createObjectURL(blob);
        const fileName = data.filename || `relatorio-abastecimentos-${new Date().toISOString().split('T')[0]}.pdf`;
        
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = fileName;
        downloadLink.style.display = 'none';
        
        document.body.appendChild(downloadLink);
        downloadLink.click();
        
        setTimeout(() => {
          document.body.removeChild(downloadLink);
          URL.revokeObjectURL(blobUrl);
        }, 100);
        
        toast.success(`Relatório gerado com ${selectedIds.length} abastecimento(s)!`);
        setSelectedIds([]);
      } catch (error: any) {
        console.error('[PDF Download Error]', error);
        toast.error(`Erro ao fazer download do PDF: ${error.message}`);
      }
    },
    onError: (error: any) => {
      toast.error(`Erro ao gerar relatório: ${error.message}`);
    },
  });

  const sendEmailMutation = trpc.fuelRecords.sendReportByEmail.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Relatório enviado para ${data.email} com sucesso!`);
      setIsEmailDialogOpen(false);
      setEmailAddress("");
      setSelectedIds([]);
    },
    onError: (error: any) => {
      toast.error(`Erro ao enviar email: ${error.message}`);
    },
  });

  const syncWithAsaasMutation = trpc.fuelRecords.syncWithAsaas.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.message || 'Sincronizado com sucesso!');
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao sincronizar: ${error.message}`);
    },
  });

  const syncAllPendingMutation = trpc.fuelRecords.syncAllPending.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Sincronização concluída! ${data.successCount} sucesso(s), ${data.failCount} falha(s)`);
      if (data.errors && data.errors.length > 0) {
        console.error('[Sync Errors]', data.errors);
      }
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao sincronizar em lote: ${error.message}`);
    },
  });

  const markAsPaidMutation = trpc.fuelRecords.markAsPaid.useMutation({
    onSuccess: () => {
      toast.success('Pagamento marcado como recebido!');
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao marcar pagamento: ${error.message}`);
    },
  });

  const handleSyncWithAsaas = (id: number) => {
    syncWithAsaasMutation.mutate({ id });
  };

  const handleSyncAllPending = () => {
    if (confirm('Deseja sincronizar todos os abastecimentos pendentes com o Asaas?')) {
      syncAllPendingMutation.mutate();
    }
  };

  const handleMarkAsPaid = (id: number) => {
    const note = prompt('Observação sobre o pagamento (opcional):');
    if (note !== null) {
      markAsPaidMutation.mutate({ id, note: note || undefined });
    }
  };

  // Preencher preço por litro e litros iniciais automaticamente ao abrir o dialog ou mudar galão
  useEffect(() => {
    if (isCreateDialogOpen && gallonStock && gallonStock.length > 0) {
      const gallon = gallonStock.find((g: any) => g.gallonNumber === parseInt(selectedGallon));
      if (gallon) {
        if (gallon.lastPricePerLiter) {
          setPricePerLiter(gallon.lastPricePerLiter.toFixed(2));
        }
        if (gallon.stockLiters !== undefined && gallon.stockLiters !== null) {
          setLitersInitial(gallon.stockLiters.toFixed(2));
          console.log(`✅ Galão ${selectedGallon} - Litros iniciais: ${gallon.stockLiters.toFixed(2)}L, Preço/L: R$${gallon.lastPricePerLiter?.toFixed(2)}`);
        }
      }
    } else if (isCreateDialogOpen && budget) {
      if (budget.lastPricePerLiter) {
        setPricePerLiter(budget.lastPricePerLiter.toFixed(2));
      }
      if (budget.stockLiters !== undefined && budget.stockLiters !== null) {
        setLitersInitial(budget.stockLiters.toFixed(2));
      }
    }
  }, [isCreateDialogOpen, selectedGallon, gallonStock, budget]);

  // Inicializar container ao ativar múltiplos galões
  useEffect(() => {
    if (useMultipleGallons && containers.length === 0) {
      addContainer();
    }
  }, [useMultipleGallons]);

  // Atualizar litros iniciais dos containers quando gallonStock mudar
  useEffect(() => {
    if (gallonStock && gallonStock.length > 0 && containers.length > 0) {
      setContainers(prev => prev.map(container => {
        const gallon = gallonStock.find((g: any) => g.gallonNumber === container.gallonNumber);
        if (gallon && gallon.stockLiters !== undefined) {
          return { ...container, litersInitial: gallon.stockLiters.toFixed(2) };
        }
        return container;
      }));
    }
  }, [gallonStock]);

  // Funções para gerenciar múltiplos galões
  const addContainer = () => {
    const usedGallons = containers.map(c => c.gallonNumber);
    let nextGallon = 1;
    for (let i = 1; i <= 3; i++) {
      if (!usedGallons.includes(i)) {
        nextGallon = i;
        break;
      }
    }
    
    const gallon = gallonStock?.find((g: any) => g.gallonNumber === nextGallon);
    const litersInitialValue = gallon?.stockLiters?.toFixed(2) || "";
    
    const newContainer: ContainerData = {
      id: `container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      gallonNumber: nextGallon,
      litersInitial: litersInitialValue,
      weightFull: "",
      weightAfter: "",
      photoBeforeUrl: "",
      photoAfterUrl: "",
      photoBeforeFile: null,
      photoAfterFile: null,
    };
    
    setContainers(prev => [...prev, newContainer]);
    
    // Atualizar preço se for o primeiro galão
    if (containers.length === 0 && gallon?.lastPricePerLiter) {
      setPricePerLiter(gallon.lastPricePerLiter.toFixed(2));
    }
  };

  const removeContainer = (id: string) => {
    if (containers.length <= 1) {
      toast.error("É necessário pelo menos um galão");
      return;
    }
    setContainers(prev => prev.filter(c => c.id !== id));
  };

  const updateContainer = (id: string, field: keyof ContainerData, value: any) => {
    setContainers(prev => prev.map(c => {
      if (c.id === id) {
        const updated = { ...c, [field]: value };
        
        if (field === 'gallonNumber') {
          const gallon = gallonStock?.find((g: any) => g.gallonNumber === value);
          if (gallon?.stockLiters !== undefined) {
            updated.litersInitial = gallon.stockLiters.toFixed(2);
          }
        }
        
        return updated;
      }
      return c;
    }));
  };

  // Upload de fotos para containers
  const handleContainerPhotoUpload = async (containerId: string, file: File, type: 'before' | 'after') => {
    setUploadingContainerPhotos(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload-receipt', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Erro ao fazer upload da foto');
      }
      
      const data = await response.json();
      
      setContainers(prev => prev.map(c => {
        if (c.id === containerId) {
          if (type === 'before') {
            return { ...c, photoBeforeUrl: data.url, photoBeforeFile: file };
          } else {
            return { ...c, photoAfterUrl: data.url, photoAfterFile: file };
          }
        }
        return c;
      }));
      
      toast.success(`Foto ${type === 'before' ? 'ANTES' : 'DEPOIS'} enviada!`);
    } catch (error: any) {
      toast.error(`Erro ao enviar foto: ${error.message}`);
    } finally {
      setUploadingContainerPhotos(false);
    }
  };

  // Calcular litros para cada container
  const calculateLitersForContainer = (container: ContainerData) => {
    const litersInit = parseFloat(container.litersInitial) || 0;
    const wFull = parseFloat(container.weightFull) || 0;
    const wAfter = parseFloat(container.weightAfter);
    
    if (!litersInit || !wFull || isNaN(wAfter) || wFull <= 0) {
      return 0;
    }
    
    const weightConsumed = wFull - wAfter;
    if (weightConsumed <= 0) return 0;
    
    return (weightConsumed / wFull) * litersInit;
  };

  // Verificar quais galões já estão em uso
  const getAvailableGallons = (currentContainerId: string) => {
    const usedGallons = containers
      .filter(c => c.id !== currentContainerId)
      .map(c => c.gallonNumber);
    return [1, 2, 3].filter(num => !usedGallons.includes(num));
  };

  const resetForm = () => {
    setSelectedBookingId(null);
    setLiters("");
    setPricePerLiter("");
    setNotes("");
    setReceiptFile(null);
    setUseWeightMethod(false);
    setLitersInitial("");
    setWeightFull("");
    setWeightAfter("");
    setPhotoBefore(null);
    setPhotoAfter(null);
    setPhotoBeforeUrl(null);
    setPhotoAfterUrl(null);
    setSelectedGallon("1");
    setUseMultipleGallons(false);
    setContainers([]);
    setIsOperational(false);
  };

  const handleDeleteClick = (id: number) => {
    setDeleteId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate({ id: deleteId });
    }
  };

  const handleToggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const displayRecords = showAllRecords ? fuelRecords : fuelRecords?.slice(0, 10);
    const displayIds = displayRecords?.map((r: any) => r.id) || [];
    
    const allDisplayedSelected = displayIds.every((id: number) => selectedIds.includes(id));
    
    if (allDisplayedSelected && selectedIds.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(displayIds);
    }
  };

  const handleGenerateReport = () => {
    if (selectedIds.length === 0) {
      toast.error('Selecione pelo menos um abastecimento');
      return;
    }
    generateReportMutation.mutate({ recordIds: selectedIds });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validar reserva apenas se não for operacional
    if (!isOperational && !selectedBookingId) {
      toast.error('Selecione uma reserva');
      return;
    }

    let booking: any = null;
    if (!isOperational) {
      booking = recentBookings?.find((b: any) => b.id === selectedBookingId);
      if (!booking) {
        toast.error('Reserva não encontrada');
        return;
      }
    }

    // MODO MÚLTIPLOS GALÕES
    if (useMultipleGallons) {
      if (containers.length === 0) {
        toast.error("Adicione pelo menos um galão");
        return;
      }
      
      // Validar cada container
      for (let i = 0; i < containers.length; i++) {
        const c = containers[i];
        if (!c.litersInitial || !c.weightFull || c.weightAfter === "") {
          toast.error(`Galão ${i + 1}: Preencha todos os campos de pesagem`);
          return;
        }
        if (!c.photoBeforeUrl || !c.photoAfterUrl) {
          toast.error(`Galão ${i + 1}: Envie as fotos da balança (antes e depois)`);
          return;
        }
        if (parseFloat(c.weightAfter) >= parseFloat(c.weightFull)) {
          toast.error(`Galão ${i + 1}: O peso após deve ser menor que o peso cheio`);
          return;
        }
      }
      
      if (!pricePerLiter) {
        toast.error("Preencha o preço por litro");
        return;
      }

      // Preparar dados dos containers para enviar
      const containersData = containers.map(c => ({
        gallonNumber: c.gallonNumber,
        litersInitial: parseFloat(c.litersInitial),
        weightFull: parseFloat(c.weightFull),
        weightAfter: parseFloat(c.weightAfter),
        photoBeforeUrl: c.photoBeforeUrl,
        photoAfterUrl: c.photoAfterUrl,
      }));

      createMutation.mutate({
        bookingId: isOperational ? undefined : (selectedBookingId ?? undefined),
        vesselId: isOperational ? (vessels?.[0]?.id || 1) : booking?.vesselId,
        pricePerLiter: parseFloat(pricePerLiter),
        notes: notes || undefined,
        gallonNumber: containers[0].gallonNumber,
        containers: containersData,
        isOperational,
      });
      return;
    }

    // MODO GALÃO ÚNICO (antigo)
    if (useWeightMethod) {
      if (!litersInitial || !weightFull || weightAfter === "") {
        toast.error('Preencha todos os campos de peso (litros iniciais, peso cheio e peso após)');
        return;
      }
      if (!photoBefore || !photoAfter) {
        toast.error('As fotos da balança (antes e depois) são obrigatórias');
        return;
      }
      if (parseFloat(weightAfter) >= parseFloat(weightFull)) {
        toast.error('O peso após deve ser menor que o peso cheio');
        return;
      }
    }

    let receiptUrl: string | undefined = undefined;
    let uploadedPhotoBeforeUrl: string | undefined = undefined;
    let uploadedPhotoAfterUrl: string | undefined = undefined;

    try {
      if (receiptFile) {
        setIsUploadingReceipt(true);
        const formData = new FormData();
        formData.append('file', receiptFile);

        const response = await fetch('/api/upload-receipt', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Erro ao fazer upload do comprovante');
        }

        const data = await response.json();
        receiptUrl = data.url;
        setIsUploadingReceipt(false);
      }

      if (useWeightMethod && photoBefore && photoAfter) {
        setIsUploadingPhotos(true);
        
        const formDataBefore = new FormData();
        formDataBefore.append('file', photoBefore);
        const responseBefore = await fetch('/api/upload-receipt', {
          method: 'POST',
          body: formDataBefore,
        });
        if (!responseBefore.ok) {
          throw new Error('Erro ao fazer upload da foto ANTES');
        }
        const dataBefore = await responseBefore.json();
        uploadedPhotoBeforeUrl = dataBefore.url;

        const formDataAfter = new FormData();
        formDataAfter.append('file', photoAfter);
        const responseAfter = await fetch('/api/upload-receipt', {
          method: 'POST',
          body: formDataAfter,
        });
        if (!responseAfter.ok) {
          throw new Error('Erro ao fazer upload da foto DEPOIS');
        }
        const dataAfter = await responseAfter.json();
        uploadedPhotoAfterUrl = dataAfter.url;
        
        setIsUploadingPhotos(false);
      }
    } catch (error: any) {
      toast.error(`Erro ao fazer upload: ${error.message}`);
      setIsUploadingReceipt(false);
      setIsUploadingPhotos(false);
      return;
    }

    let finalLiters = parseFloat(liters);
    if (useWeightMethod && litersInitial && weightFull && weightAfter !== "") {
      const pesoConsumed = parseFloat(weightFull) - parseFloat(weightAfter);
      const litersCalculated = (pesoConsumed * parseFloat(litersInitial)) / parseFloat(weightFull);
      finalLiters = parseFloat(litersCalculated.toFixed(2));
    }

    createMutation.mutate({
      bookingId: isOperational ? undefined : (selectedBookingId ?? undefined),
      vesselId: isOperational ? (vessels?.[0]?.id || 1) : booking?.vesselId,
      liters: finalLiters,
      pricePerLiter: parseFloat(pricePerLiter),
      notes: notes || undefined,
      receiptUrl,
      litersInitial: useWeightMethod ? parseFloat(litersInitial) : undefined,
      weightFull: useWeightMethod ? parseFloat(weightFull) : undefined,
      weightAfter: useWeightMethod ? parseFloat(weightAfter) : undefined,
      photoBeforeUrl: uploadedPhotoBeforeUrl,
      photoAfterUrl: uploadedPhotoAfterUrl,
      gallonNumber: parseInt(selectedGallon),
      isOperational,
    });
  };

  const SERVICE_FEE = 10.00;
  
  // Calcular litros (modo galão único)
  const calculatedLiters = useWeightMethod && litersInitial && weightFull && weightAfter !== ""
    ? ((parseFloat(weightFull) - parseFloat(weightAfter)) * parseFloat(litersInitial)) / parseFloat(weightFull)
    : (liters ? parseFloat(liters) : 0);
  
  // Calcular totais (modo múltiplos galões)
  const totalLitersMultiple = containers.reduce((sum, c) => sum + calculateLitersForContainer(c), 0);
  
  // Subtotal e total
  const subtotal = useMultipleGallons
    ? (totalLitersMultiple * (parseFloat(pricePerLiter) || 0))
    : (calculatedLiters * (parseFloat(pricePerLiter) || 0));
  const totalCost = (subtotal + SERVICE_FEE).toFixed(2);

  // Estatísticas - Usando nomes corretos do backend
  const totalCobrado = financialStats?.totalBilled || 0;
  const totalRecebido = financialStats?.totalReceived || 0;
  const totalPendente = financialStats?.totalPending || 0;
  const totalVencido = financialStats?.totalOverdue || 0;
  const countRecords = financialStats?.totalRecords || 0;

  // Orçamento (usa totalBudget que é calculado automaticamente pelo backend)
  const budgetAmount = budget?.totalBudget || 0;
  const budgetUsedPercent = budgetAmount > 0 ? Math.min((totalCobrado / budgetAmount) * 100, 100) : 0;
  
  // Saldo com herança do mês anterior (fórmula: herdado + gasto - orçamento)
  const inheritedBalance = balanceData?.inherited || 0;
  const saldo = inheritedBalance + totalCobrado - budgetAmount;

  // Estoque total
  const totalStock = gallonStock?.reduce((sum: number, g: any) => sum + (g.stockLiters || 0), 0) || 0;

  // Preço/L médio ponderado: (soma total R$ das compras) / (soma total litros das compras)
  // Calculado a partir dos dados de cada galão
  const totalLitersPurchased = gallonStock?.reduce((sum: number, g: any) => sum + (g.totalPurchased || 0), 0) || 0;
  const totalAmountPurchased = gallonStock?.reduce((sum: number, g: any) => sum + ((g.totalPurchased || 0) * (g.lastPricePerLiter || 0)), 0) || 0;
  const avgPricePerLiter = totalLitersPurchased > 0
    ? Math.ceil((totalAmountPurchased / totalLitersPurchased) * 100) / 100 // Arredondar para cima
    : ((gallonStock?.length ?? 0) > 0
        ? gallonStock!.reduce((sum: number, g: any) => sum + (g.lastPricePerLiter || 0), 0) / gallonStock!.length
        : 0);

  return (
    <div className="container py-8">
      <div className="mb-6">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </Link>
        
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Abastecimento</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Registre o abastecimento das embarcações após o uso
            </p>
          </div>
          
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Mês</Label>
              <Select 
                value={String(selectedMonth)} 
                onValueChange={(value) => setSelectedMonth(parseInt(value))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Janeiro</SelectItem>
                  <SelectItem value="2">Fevereiro</SelectItem>
                  <SelectItem value="3">Março</SelectItem>
                  <SelectItem value="4">Abril</SelectItem>
                  <SelectItem value="5">Maio</SelectItem>
                  <SelectItem value="6">Junho</SelectItem>
                  <SelectItem value="7">Julho</SelectItem>
                  <SelectItem value="8">Agosto</SelectItem>
                  <SelectItem value="9">Setembro</SelectItem>
                  <SelectItem value="10">Outubro</SelectItem>
                  <SelectItem value="11">Novembro</SelectItem>
                  <SelectItem value="12">Dezembro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Ano</Label>
              <Select 
                value={String(selectedYear)} 
                onValueChange={(value) => setSelectedYear(parseInt(value))}
              >
                <SelectTrigger className="w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Cards de Resumo Financeiro */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Herdado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${
              balanceData && balanceData.inherited < 0 
                ? 'text-red-600' 
                : 'text-blue-600'
            }`}>
              R$ {balanceData?.inherited?.toFixed(2) || "0.00"}
            </p>
            <p className="text-xs text-muted-foreground">Do mês anterior</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Orçamento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">R$ {balanceData?.budget?.toFixed(2) || "0.00"}</p>
            <p className="text-xs text-muted-foreground">Compras do mês</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gasto</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">R$ {balanceData?.spent?.toFixed(2) || "0.00"}</p>
            <p className="text-xs text-muted-foreground">Abastecimentos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Atual</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${
              balanceData && balanceData.current < 0 
                ? 'text-red-600' 
                : 'text-green-600'
            }`}>
              R$ {balanceData?.current?.toFixed(2) || "0.00"}
            </p>
            <p className="text-xs text-muted-foreground">Herdado + Gasto - Orçamento</p>
          </CardContent>
        </Card>
      </div>

      {/* Card de Orçamento */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Orçamento Mensal</CardTitle>
              <CardDescription>
                {new Date(selectedYear, selectedMonth - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsBudgetDialogOpen(true)}>
              <Settings className="w-4 h-4 mr-2" />
              Configurar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm">Gasto: R$ {totalCobrado.toFixed(2)}</span>
            <span className="text-sm">Orçamento: R$ {budgetAmount.toFixed(2)}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
            <div 
              className={`h-full transition-all ${budgetUsedPercent > 90 ? 'bg-red-500' : budgetUsedPercent > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${budgetUsedPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{budgetUsedPercent.toFixed(1)}% utilizado</p>
          
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Fuel className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">Estoque:</span>
            </div>
            <div className="text-right">
              <p className="font-bold">{totalStock.toFixed(2)} L</p>
              <p className="text-xs text-muted-foreground">Preço/L atual: R$ {avgPricePerLiter.toFixed(2)}</p>
            </div>
          </div>

          {(financialStats?.operationalCost ?? 0) > 0 && (
            <div className="mt-3 pt-3 border-t flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium">Custo Operacional ({financialStats?.operationalCostYear}):</span>
              </div>
              <p className="font-bold text-orange-600">R$ {financialStats?.operationalCost.toFixed(2)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card BPO: Cobranças de Abastecimento */}
      {bpoFuelStats && (
        <Card className="mb-6 border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="w-4 h-4 text-blue-600" />
              Cobranças BPO — Abastecimentos ({selectedYear})
            </CardTitle>
            <p className="text-xs text-muted-foreground">Dados financeiros centralizados de bpo_charges</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center p-2 bg-white rounded-lg border">
                <p className="text-xs text-muted-foreground">Total Cobrado</p>
                <p className="font-bold text-sm">R$ {bpoFuelStats.totalExpected.toFixed(2)}</p>
              </div>
              <div className="text-center p-2 bg-white rounded-lg border">
                <p className="text-xs text-muted-foreground">Recebido</p>
                <p className="font-bold text-sm text-green-600">R$ {bpoFuelStats.totalPaid.toFixed(2)}</p>
              </div>
              <div className="text-center p-2 bg-white rounded-lg border">
                <p className="text-xs text-muted-foreground">Pendente</p>
                <p className="font-bold text-sm text-yellow-600">R$ {bpoFuelStats.totalPending.toFixed(2)}</p>
              </div>
              <div className="text-center p-2 bg-white rounded-lg border">
                <p className="text-xs text-muted-foreground">Vencido</p>
                <p className="font-bold text-sm text-red-600">R$ {bpoFuelStats.totalOverdue.toFixed(2)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{bpoFuelStats.totalCount} cobranças registradas no BPO</p>
          </CardContent>
        </Card>
      )}

      {/* Botões de Ação */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleSyncAllPending}
          disabled={syncAllPendingMutation.isPending}
        >
          {syncAllPendingMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Sincronizar Pendentes
        </Button>
        
        {selectedIds.length > 0 && (
          <>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleGenerateReport}
              disabled={generateReportMutation.isPending}
            >
              {generateReportMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              Relatório PDF
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsEmailDialogOpen(true)}
            >
              <Mail className="w-4 h-4 mr-2" />
              Enviar Email
            </Button>
          </>
        )}
        
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Registrar Abastecimento
        </Button>
      </div>

      {/* Lista de Registros */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Registros Recentes</h2>
          <div className="flex gap-2">
            {fuelRecords && fuelRecords.length > 10 && (
              <div className="flex gap-2">
                <Button
                  variant={!showAllRecords ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowAllRecords(false)}
                >
                  Últimos 10
                </Button>
                <Button
                  variant={showAllRecords ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowAllRecords(true)}
                >
                  Todos
                </Button>
              </div>
            )}
            {fuelRecords && fuelRecords.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleSelectAll}
              >
                {selectedIds.length === fuelRecords.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </Button>
            )}
          </div>
        </div>

        {fuelRecordsError ? (
          <Card>
            <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-destructive">Não foi possível carregar os registros de abastecimento.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        ) : fuelRecordsLoading ? (
          <Card>
            <CardContent className="py-8 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : !fuelRecords || fuelRecords.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum registro de abastecimento encontrado
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {(() => {
              const displayRecords = showAllRecords ? fuelRecords : fuelRecords.slice(0, 10);
              
              return displayRecords.map((record: any) => (
                <Card key={record.id} className={selectedIds.includes(record.id) ? 'ring-2 ring-primary' : ''}>
                  <CardHeader className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <Checkbox 
                          checked={selectedIds.includes(record.id)}
                          onCheckedChange={() => handleToggleSelection(record.id)}
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
                              onClick={() => handleSyncWithAsaas(record.id)}
                              disabled={syncWithAsaasMutation.isPending}
                              title="Sincronizar com Asaas"
                            >
                              <RefreshCw className={`w-4 h-4 ${syncWithAsaasMutation.isPending ? 'animate-spin' : ''}`} />
                            </Button>
                          )}
                          {!record.is_operational && (record.payment_status === 'pending' || record.payment_status === 'overdue') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMarkAsPaid(record.id)}
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
                            onClick={() => handleDeleteClick(record.id)}
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
              ));
            })()}
          </div>
        )}
      </div>

      {/* Create Dialog - COM SUPORTE A MÚLTIPLOS GALÕES */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Registrar Abastecimento</DialogTitle>
              <DialogDescription>
                Registre o abastecimento após a vistoria da embarcação
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="booking">Reserva {!isOperational && '*'}</Label>
                <Select 
                  value={selectedBookingId?.toString()} 
                  onValueChange={(value) => setSelectedBookingId(parseInt(value))}
                  disabled={isOperational}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isOperational ? "N/A (abastecimento operacional)" : "Selecione uma reserva"} />
                  </SelectTrigger>
                  <SelectContent>
                    {recentBookings?.map((booking: any) => {
                      const vessel = vessels?.find(v => v.id === booking.vesselId);
                      return (
                        <SelectItem key={booking.id} value={booking.id.toString()}>
                          {vessel?.name} - {booking.clientName} ({new Date(booking.startTime).toLocaleDateString('pt-BR')})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Toggle para abastecimento operacional */}
              <div className="flex items-center space-x-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <Checkbox 
                  id="isOperational" 
                  checked={isOperational}
                  onCheckedChange={(checked) => {
                    setIsOperational(checked as boolean);
                    if (checked) {
                      setSelectedBookingId(null); // Limpar reserva quando operacional
                    }
                  }}
                />
                <Label htmlFor="isOperational" className="text-sm font-medium cursor-pointer">
                  ⚠️ Abastecimento operacional (custo da empresa)
                </Label>
              </div>

              {/* Toggle para múltiplos galões */}
              <div className="flex items-center space-x-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <Checkbox 
                  id="useMultipleGallons" 
                  checked={useMultipleGallons}
                  onCheckedChange={(checked) => {
                    setUseMultipleGallons(checked as boolean);
                    if (!checked) {
                      setContainers([]);
                    }
                  }}
                />
                <Label htmlFor="useMultipleGallons" className="text-sm font-medium cursor-pointer">
                  Usar múltiplos galões neste abastecimento
                </Label>
              </div>

              {/* MODO MÚLTIPLOS GALÕES */}
              {useMultipleGallons ? (
                <>
                  {/* Lista de Galões (Containers) */}
                  {containers.map((container, index) => {
                    const litersForThisContainer = calculateLitersForContainer(container);
                    const weightConsumed = parseFloat(container.weightFull) - parseFloat(container.weightAfter);
                    
                    return (
                      <div key={container.id} className="border rounded-lg p-4 space-y-4 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-lg flex items-center gap-2">
                            <Fuel className="w-5 h-5 text-primary" />
                            {index === 0 ? 'Galão Principal' : `Galão Adicional ${index}`}
                          </h3>
                          {containers.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeContainer(container.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Remover
                            </Button>
                          )}
                        </div>
                        
                        {/* Seletor de Galão */}
                        <div>
                          <Label>Selecione o Galão *</Label>
                          <Select 
                            value={container.gallonNumber.toString()} 
                            onValueChange={(value) => updateContainer(container.id, 'gallonNumber', parseInt(value))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o galão" />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3].map((num) => {
                                const gallon = gallonStock?.find((g: any) => g.gallonNumber === num);
                                const stockLiters = gallon?.stockLiters || 0;
                                const isLow = stockLiters > 0 && stockLiters < 5;
                                const isUsed = containers.some(c => c.id !== container.id && c.gallonNumber === num);
                                return (
                                  <SelectItem 
                                    key={num} 
                                    value={num.toString()}
                                    disabled={isUsed}
                                  >
                                    <span className={isLow ? 'text-red-600' : isUsed ? 'text-muted-foreground' : ''}>
                                      Galão {num} - {stockLiters.toFixed(2)} L disponíveis
                                      {isLow && ' ⚠️'}
                                      {isUsed && ' (em uso)'}
                                    </span>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* Litros Iniciais (readonly) */}
                        <div>
                          <Label>Litros Iniciais no Galão</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={container.litersInitial}
                            readOnly
                            disabled
                            className="bg-muted cursor-not-allowed"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Valor do estoque atual (preenchido automaticamente)
                          </p>
                        </div>
                        
                        {/* Peso Cheio */}
                        <div>
                          <Label>Peso do Galão Cheio (kg) *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={container.weightFull}
                            onChange={(e) => updateContainer(container.id, 'weightFull', e.target.value)}
                            placeholder="Ex: 37.80"
                            required
                          />
                        </div>
                        
                        {/* Peso Após */}
                        <div>
                          <Label>Peso do Galão Após (kg) *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={container.weightAfter}
                            onChange={(e) => updateContainer(container.id, 'weightAfter', e.target.value)}
                            placeholder="Ex: 23.40 (ou 0 se vazio)"
                            required
                          />
                        </div>
                        
                        {/* Preview do cálculo */}
                        {container.litersInitial && container.weightFull && container.weightAfter !== "" && (
                          <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                            <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
                              ⚖️ Cálculo Automático:
                            </p>
                            <p className="text-xs text-green-700 dark:text-green-300">
                              Peso consumido: {weightConsumed.toFixed(2)} kg
                            </p>
                            <p className="text-xs text-green-700 dark:text-green-300">
                              Litros consumidos: {litersForThisContainer.toFixed(2)} L
                            </p>
                          </div>
                        )}
                        
                        {/* Upload fotos */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Foto ANTES *</Label>
                            <Input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (file.size > 5 * 1024 * 1024) {
                                    toast.error('Arquivo muito grande. Máximo: 5MB');
                                    e.target.value = '';
                                    return;
                                  }
                                  handleContainerPhotoUpload(container.id, file, 'before');
                                }
                              }}
                              disabled={uploadingContainerPhotos}
                            />
                            {container.photoBeforeUrl && (
                              <div className="mt-2">
                                <img src={container.photoBeforeUrl} alt="Preview ANTES" className="w-full h-24 object-cover rounded-lg border" />
                                <p className="text-xs text-green-600 mt-1">✓ Foto enviada</p>
                              </div>
                            )}
                          </div>
                          <div>
                            <Label>Foto DEPOIS *</Label>
                            <Input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (file.size > 5 * 1024 * 1024) {
                                    toast.error('Arquivo muito grande. Máximo: 5MB');
                                    e.target.value = '';
                                    return;
                                  }
                                  handleContainerPhotoUpload(container.id, file, 'after');
                                }
                              }}
                              disabled={uploadingContainerPhotos}
                            />
                            {container.photoAfterUrl && (
                              <div className="mt-2">
                                <img src={container.photoAfterUrl} alt="Preview DEPOIS" className="w-full h-24 object-cover rounded-lg border" />
                                <p className="text-xs text-green-600 mt-1">✓ Foto enviada</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Botão para adicionar mais galões */}
                  {containers.length < 3 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addContainer}
                      className="w-full"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar outro Galão
                    </Button>
                  )}
                  
                  {/* Preço por litro */}
                  <div>
                    <Label>Preço por Litro (R$) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={pricePerLiter}
                      onChange={(e) => setPricePerLiter(e.target.value)}
                      placeholder="Ex: 6.50"
                      required
                    />
                  </div>
                  
                  {/* Resumo do abastecimento */}
                  {containers.length > 0 && totalLitersMultiple > 0 && pricePerLiter && (
                    <div className="p-4 bg-primary/10 rounded-lg space-y-2">
                      <h4 className="font-semibold">📊 Resumo do Abastecimento</h4>
                      {containers.map((c, i) => {
                        const liters = calculateLitersForContainer(c);
                        return (
                          <div key={c.id} className="flex justify-between text-sm">
                            <span>Galão {c.gallonNumber}:</span>
                            <span>{liters.toFixed(2)} L</span>
                          </div>
                        );
                      })}
                      <div className="border-t pt-2 mt-2">
                        <div className="flex justify-between text-sm">
                          <span>Total de Litros:</span>
                          <span className="font-medium">{totalLitersMultiple.toFixed(2)} L</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Combustível ({totalLitersMultiple.toFixed(2)}L × R$ {parseFloat(pricePerLiter).toFixed(2)}):</span>
                          <span className="font-medium">R$ {subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Taxa de Abastecimento:</span>
                          <span className="font-medium">R$ {SERVICE_FEE.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t">
                          <span>Valor Total:</span>
                          <span className="text-primary">R$ {totalCost}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* MODO GALÃO ÚNICO (antigo) */
                <>
                  {/* Seletor de Galão */}
                  <div className="grid gap-2">
                    <Label htmlFor="gallon">Selecione o Galão *</Label>
                    <Select value={selectedGallon} onValueChange={setSelectedGallon}>
                      <SelectTrigger id="gallon">
                        <SelectValue placeholder="Selecione o galão" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3].map((num) => {
                          const gallon = gallonStock?.find((g: any) => g.gallonNumber === num);
                          const stockLiters = gallon?.stockLiters || 0;
                          const isLow = stockLiters > 0 && stockLiters < 5;
                          return (
                            <SelectItem key={num} value={num.toString()}>
                              <span className={isLow ? 'text-red-600' : ''}>
                                Galão {num} - {stockLiters.toFixed(2)} L disponíveis
                                {isLow && ' ⚠️'}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const gallon = gallonStock?.find((g: any) => g.gallonNumber === parseInt(selectedGallon));
                      const stockLiters = gallon?.stockLiters || 0;
                      const pricePerL = gallon?.lastPricePerLiter || 0;
                      return (
                        <div className="text-xs text-muted-foreground">
                          Estoque atual: <span className="font-semibold">{stockLiters.toFixed(2)} L</span>
                          {pricePerL > 0 && <> | Preço/L: <span className="font-semibold">R$ {pricePerL.toFixed(2)}</span></>}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Checkbox para ativar método de pesagem */}
                  <div className="flex items-center space-x-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <Checkbox 
                      id="useWeightMethod" 
                      checked={useWeightMethod}
                      onCheckedChange={(checked) => setUseWeightMethod(checked as boolean)}
                    />
                    <Label htmlFor="useWeightMethod" className="text-sm font-medium cursor-pointer">
                      Usar método de pesagem com balança
                    </Label>
                  </div>

                  {/* Campos de pesagem (aparecem apenas se checkbox estiver marcado) */}
                  {useWeightMethod && (
                    <>
                      <div className="grid gap-2">
                        <Label htmlFor="litersInitial">Litros Iniciais no Galão *</Label>
                        <Input
                          id="litersInitial"
                          type="number"
                          step="0.01"
                          value={litersInitial}
                          readOnly
                          disabled
                          className="bg-muted cursor-not-allowed"
                        />
                        <p className="text-xs text-muted-foreground">
                          Valor do estoque atual (preenchido automaticamente)
                        </p>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="weightFull">Peso do Galão Cheio (kg) *</Label>
                        <Input
                          id="weightFull"
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={weightFull}
                          onChange={(e) => setWeightFull(e.target.value)}
                          placeholder="Ex: 37,80"
                          required={useWeightMethod}
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="weightAfter">Peso do Galão Após (kg) *</Label>
                        <Input
                          id="weightAfter"
                          type="number"
                          step="0.01"
                          min="0"
                          value={weightAfter}
                          onChange={(e) => setWeightAfter(e.target.value)}
                          placeholder="Ex: 23,40 (ou 0 se vazio)"
                          required={useWeightMethod}
                        />
                      </div>

                      {/* Preview do cálculo */}
                      {litersInitial && weightFull && weightAfter !== "" && (
                        <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                          <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
                            ⚖️ Cálculo Automático:
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-300">
                            Peso consumido: {(parseFloat(weightFull) - parseFloat(weightAfter)).toFixed(2)} kg
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-300">
                            Litros consumidos: {calculatedLiters.toFixed(2)} L
                          </p>
                        </div>
                      )}

                      {/* Upload foto ANTES */}
                      <div className="grid gap-2">
                        <Label htmlFor="photoBefore">Foto da Balança - ANTES *</Label>
                        <Input
                          id="photoBefore"
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 5 * 1024 * 1024) {
                                toast.error('Arquivo muito grande. Tamanho máximo: 5MB');
                                e.target.value = '';
                                return;
                              }
                              setPhotoBefore(file);
                              setPhotoBeforeUrl(URL.createObjectURL(file));
                            }
                          }}
                          required={useWeightMethod}
                        />
                        {photoBeforeUrl && (
                          <div className="mt-2">
                            <img src={photoBeforeUrl} alt="Preview ANTES" className="w-full h-32 object-cover rounded-lg border" />
                          </div>
                        )}
                      </div>

                      {/* Upload foto DEPOIS */}
                      <div className="grid gap-2">
                        <Label htmlFor="photoAfter">Foto da Balança - DEPOIS *</Label>
                        <Input
                          id="photoAfter"
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 5 * 1024 * 1024) {
                                toast.error('Arquivo muito grande. Tamanho máximo: 5MB');
                                e.target.value = '';
                                return;
                              }
                              setPhotoAfter(file);
                              setPhotoAfterUrl(URL.createObjectURL(file));
                            }
                          }}
                          required={useWeightMethod}
                        />
                        {photoAfterUrl && (
                          <div className="mt-2">
                            <img src={photoAfterUrl} alt="Preview DEPOIS" className="w-full h-32 object-cover rounded-lg border" />
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Campo de litros (apenas se NÃO usar método de pesagem) */}
                  {!useWeightMethod && (
                    <div className="grid gap-2">
                      <Label htmlFor="liters">Litros Abastecidos *</Label>
                      <Input
                        id="liters"
                        type="number"
                        step="0.01"
                        min="0"
                        value={liters}
                        onChange={(e) => setLiters(e.target.value)}
                        placeholder="Ex: 25,50"
                        required={!useWeightMethod}
                      />
                    </div>
                  )}

                  <div className="grid gap-2">
                    <Label htmlFor="pricePerLiter">Preço por Litro (R$) *</Label>
                    <Input
                      id="pricePerLiter"
                      type="number"
                      step="0.01"
                      min="0"
                      value={pricePerLiter}
                      onChange={(e) => setPricePerLiter(e.target.value)}
                      placeholder="Ex: 6.50"
                      required
                    />
                  </div>

                  {((useWeightMethod && litersInitial && weightFull && weightAfter !== "") || (!useWeightMethod && liters)) && pricePerLiter && (
                    <div className="p-4 bg-primary/10 rounded-lg space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Combustível ({calculatedLiters.toFixed(2)}L × R$ {parseFloat(pricePerLiter).toFixed(2)}):</span>
                        <span className="font-medium">R$ {subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>Taxa de Abastecimento e Aplicativo:</span>
                        <span className="font-medium">R$ {SERVICE_FEE.toFixed(2)}</span>
                      </div>
                      <div className="border-t pt-2 flex items-center justify-between">
                        <span className="font-semibold">Valor Total:</span>
                        <span className="text-2xl font-bold text-primary">R$ {totalCost}</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="grid gap-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Tanque estava pela metade"
                  rows={3}
                />
              </div>

              {/* Campo de Upload de Comprovante (apenas modo galão único) */}
              {!useMultipleGallons && (
                <div className="grid gap-2">
                  <Label htmlFor="receipt">Comprovante (Foto do Cupom Fiscal)</Label>
                  <Input
                    id="receipt"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 5 * 1024 * 1024) {
                          toast.error('Arquivo muito grande. Tamanho máximo: 5MB');
                          e.target.value = '';
                          return;
                        }
                        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
                          toast.error('Formato inválido. Use imagem ou PDF');
                          e.target.value = '';
                          return;
                        }
                        setReceiptFile(file);
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Formatos aceitos: JPG, PNG, PDF (máx. 5MB)
                  </p>
                  {receiptFile && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <span>✓ Arquivo selecionado: {receiptFile.name}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || isUploadingReceipt || isUploadingPhotos || uploadingContainerPhotos}>
                {(createMutation.isPending || isUploadingReceipt || isUploadingPhotos || uploadingContainerPhotos) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {uploadingContainerPhotos ? 'Enviando fotos...' : isUploadingPhotos ? 'Enviando fotos...' : isUploadingReceipt ? 'Enviando comprovante...' : 'Registrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de envio por email */}
      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar Relatório por Email</DialogTitle>
            <DialogDescription>
              Informe o endereço de email para enviar o relatório de abastecimentos
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="exemplo@email.com"
                required
              />
            </div>
            <div className="bg-muted p-3 rounded-md text-sm">
              <p className="text-muted-foreground">
                <strong>{selectedIds.length}</strong> abastecimento(s) selecionado(s) serão enviados em PDF.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setIsEmailDialogOpen(false);
                setEmailAddress("");
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (!emailAddress) {
                  toast.error('Informe um email válido');
                  return;
                }
                sendEmailMutation.mutate({ recordIds: selectedIds, email: emailAddress });
              }}
              disabled={sendEmailMutation.isPending || !emailAddress}
            >
              {sendEmailMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Gestão de Combustível */}
      <FuelManagementDialog 
        open={isBudgetDialogOpen} 
        onOpenChange={setIsBudgetDialogOpen}
        monthYear={currentMonthYear}
      />

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este registro de abastecimento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
