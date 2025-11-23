import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Cloud, CloudRain, Droplets, Wind } from "lucide-react";

interface WeatherWidgetProps {
  date: Date;
}

export function WeatherWidget({ date }: WeatherWidgetProps) {
  const { data: weather, isLoading, error } = trpc.weather.forecast.useQuery(
    { date: date.getTime() },
    { enabled: !!date }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Previsão do Tempo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (error || !weather) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Previsão indisponível</AlertTitle>
        <AlertDescription>
          Não foi possível carregar a previsão do tempo. Verifique as condições antes de sair.
        </AlertDescription>
      </Alert>
    );
  }

  const isFavorable = weather.rainProbability < 60 && weather.windSpeed <= 25;

  return (
    <div className="space-y-3">
      <Card className={!isFavorable ? "border-orange-500" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cloud className="h-5 w-5" />
            Previsão do Tempo
            <span className="text-2xl ml-auto">{weather.emoji}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Temperatura</p>
              <p className="text-2xl font-bold">{weather.temperature}°C</p>
              <p className="text-xs text-muted-foreground">
                Min: {weather.tempMin}°C / Max: {weather.tempMax}°C
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Condição</p>
              <p className="text-lg font-semibold capitalize">{weather.description}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-3 border-t">
            <div className="flex items-center gap-2">
              <CloudRain className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Chuva</p>
                <p className="text-sm font-semibold">{weather.rainProbability}%</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Wind className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-xs text-muted-foreground">Vento</p>
                <p className="text-sm font-semibold">{weather.windSpeed} km/h</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-cyan-500" />
              <div>
                <p className="text-xs text-muted-foreground">Umidade</p>
                <p className="text-sm font-semibold">{weather.humidity}%</p>
              </div>
            </div>
          </div>

          <div className={`p-3 rounded-lg ${isFavorable ? "bg-green-50 text-green-800" : "bg-orange-50 text-orange-800"}`}>
            <p className="text-sm font-semibold">
              {isFavorable ? "✅ Condições favoráveis para navegação" : "⚠️ Condições podem não ser ideais"}
            </p>
          </div>
        </CardContent>
      </Card>

      {!isFavorable && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Atenção</AlertTitle>
          <AlertDescription>
            {weather.rainProbability >= 80 && "Alta probabilidade de chuva. Recomendamos reagendar."}
            {weather.rainProbability >= 60 && weather.rainProbability < 80 && "Probabilidade moderada de chuva. Fique atento."}
            {weather.windSpeed > 25 && " Ventos fortes previstos. Navegação pode ser desconfortável."}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
