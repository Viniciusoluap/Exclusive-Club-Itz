import { useState } from "react";
import { X, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { APP_LOGO, APP_TITLE } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";

interface Photo {
  id: number;
  src: string;
  alt: string;
  category: "lancha" | "jetski" | "geral";
}

const photos: Photo[] = [
  // Fotos da Lancha
  { id: 1, src: "/images/vessels/IMG_9049.jpg", alt: "Lancha Focker 215 - Vista lateral", category: "lancha" },
  { id: 2, src: "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028705863/zSVYOTGDStntPscX.jpg", alt: "Lancha Focker 215 - Proa", category: "lancha" },
  { id: 3, src: "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028705863/PewUysetmNieAOBg.jpg", alt: "Lancha Focker 215 - Interior completo", category: "lancha" },
  { id: 4, src: "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028705863/fVpvABTaxUqQXRRk.jpg", alt: "Lancha Focker 215 - Vista aérea", category: "lancha" },
  { id: 5, src: "/images/vessels/IMG_9045.jpg", alt: "Lancha Focker 215 - Cabine interna", category: "lancha" },
  { id: 6, src: "/images/vessels/IMG_9044.jpg", alt: "Lancha Focker 215 - Cockpit", category: "lancha" },
  { id: 7, src: "/images/vessels/IMG_9043.jpg", alt: "Lancha Focker 215 - Deck completo", category: "lancha" },
  { id: 8, src: "/images/vessels/IMG_3911.jpg", alt: "Lancha Focker 215 - Atracada", category: "lancha" },
  
  // Fotos do Jetski
  { id: 9, src: "/images/vessels/IMG_0485.jpg", alt: "Jetski Sea-Doo - Em movimento", category: "jetski" },
  { id: 11, src: "/images/vessels/IMG_8551.jpg", alt: "Jetski Sea-Doo - Na margem", category: "jetski" },
  { id: 12, src: "/images/vessels/IMG_8550.jpg", alt: "Jetski Sea-Doo - Vista lateral", category: "jetski" },
  { id: 13, src: "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028705863/XxrTfvztiVVXnIme.jpg", alt: "Jetski Sea-Doo - Detalhes", category: "jetski" },
  { id: 14, src: "/images/vessels/IMG_8548.jpg", alt: "Jetski Sea-Doo - Painel", category: "jetski" },
  { id: 15, src: "/images/vessels/IMG_8546.jpg", alt: "Jetski Sea-Doo - Na praia", category: "jetski" },
];

export default function Galeria() {
  const { user, isAuthenticated } = useAuth();
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [filter, setFilter] = useState<"todos" | "lancha" | "jetski">("todos");

  const filteredPhotos = filter === "todos" 
    ? photos 
    : photos.filter(p => p.category === filter);

  const currentIndex = selectedPhoto 
    ? filteredPhotos.findIndex(p => p.id === selectedPhoto.id)
    : -1;

  const goToNext = () => {
    if (currentIndex < filteredPhotos.length - 1) {
      setSelectedPhoto(filteredPhotos[currentIndex + 1]);
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setSelectedPhoto(filteredPhotos[currentIndex - 1]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <img src={APP_LOGO} alt={APP_TITLE} className="h-10 w-10 rounded-full object-cover" style={{width: '70px', height: '65px'}} />
            <span className="text-xl font-bold text-cyan-700">{APP_TITLE}</span>
          </a>
          <nav className="flex gap-6 items-center">
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-1 text-gray-700 hover:text-cyan-600 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-cyan-600 to-blue-600 py-16 text-white">
        <div className="container mx-auto text-center">
          <h1 className="text-4xl font-bold mb-4">Galeria de Fotos</h1>
          <p className="text-xl text-cyan-100">
            Conheça nossas embarcações de perto
          </p>
        </div>
      </section>

      {/* Filter Buttons */}
      <div className="container mx-auto py-8">
        <div className="flex justify-center gap-4">
          <button
            onClick={() => setFilter("todos")}
            className={`px-6 py-2 rounded-full font-medium transition-all ${
              filter === "todos"
                ? "bg-cyan-600 text-white shadow-lg"
                : "bg-white text-gray-700 hover:bg-gray-100 border"
            }`}
          >
            Todas ({photos.length})
          </button>
          <button
            onClick={() => setFilter("lancha")}
            className={`px-6 py-2 rounded-full font-medium transition-all ${
              filter === "lancha"
                ? "bg-cyan-600 text-white shadow-lg"
                : "bg-white text-gray-700 hover:bg-gray-100 border"
            }`}
          >
            Lancha ({photos.filter(p => p.category === "lancha").length})
          </button>
          <button
            onClick={() => setFilter("jetski")}
            className={`px-6 py-2 rounded-full font-medium transition-all ${
              filter === "jetski"
                ? "bg-cyan-600 text-white shadow-lg"
                : "bg-white text-gray-700 hover:bg-gray-100 border"
            }`}
          >
            Jetski ({photos.filter(p => p.category === "jetski").length})
          </button>
        </div>
      </div>

      {/* Photo Grid */}
      <div className="container mx-auto pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPhotos.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-[4/3] overflow-hidden rounded-lg shadow-md cursor-pointer transition-transform hover:scale-105"
              onClick={() => setSelectedPhoto(photo)}
            >
              <img
                src={photo.src}
                alt={photo.alt}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <p className="text-white font-medium">{photo.alt}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          {/* Close Button */}
          <button
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Fechar"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Previous Button */}
          {currentIndex > 0 && (
            <button
              onClick={goToPrevious}
              className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
          )}

          {/* Image */}
          <div className="max-w-5xl max-h-[90vh] flex flex-col items-center">
            <img
              src={selectedPhoto.src}
              alt={selectedPhoto.alt}
              className="max-h-[80vh] w-auto object-contain rounded-lg"
            />
            <p className="mt-4 text-white text-center">{selectedPhoto.alt}</p>
            <p className="text-white/60 text-sm">
              {currentIndex + 1} / {filteredPhotos.length}
            </p>
          </div>

          {/* Next Button */}
          {currentIndex < filteredPhotos.length - 1 && (
            <button
              onClick={goToNext}
              className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Próxima"
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
