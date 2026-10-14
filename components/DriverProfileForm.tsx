"use client";

/**
 * Formulario para publicar/editar la ficha pública del conductor (Fase 2) en `/panel`.
 *
 * Reutiliza `VehicleSelector` (catálogo con filtro por tipo) y `TariffEditor` (las cuatro tarifas)
 * para no duplicar la UI ya probada del perfil local. La escritura va a una Server Action; aquí solo
 * se arma el objeto y se muestra el resultado.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Check, Eye, EyeOff, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import InlineMessage from "@/components/InlineMessage";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TariffEditor from "@/components/TariffEditor";
import VehicleSelector from "@/components/VehicleSelector";
import { saveDriverProfile } from "@/lib/actions/drivers";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_TARIFF, isValidName, type DriverTariffConfig } from "@/lib/driverProfile";
import { formatVehicleType, VEHICLE_LABELS, VEHICLE_TYPES } from "@/lib/pricing";
import { getYears } from "@/lib/vehicleCatalog";
import type { MyDriver } from "@/lib/drivers";
import type { VehicleType } from "@/types";
import type { Vehicle } from "@/types/vehicle";

export interface DriverProfileFormProps {
  /** Ficha actual del conductor, o `null` si todavía no publicó. */
  initial: MyDriver | null;
}

function toVehicle(initial: MyDriver | null): Vehicle | null {
  if (initial === null) return null;
  return {
    brand: initial.vehicleBrand,
    model: initial.vehicleModel,
    year: initial.vehicleYear ?? getYears()[0],
    vehicleType: initial.vehicleType,
  };
}

function toTariff(initial: MyDriver | null): DriverTariffConfig {
  if (initial?.tariff == null) return DEFAULT_TARIFF;
  return {
    baseFare: Number(initial.tariff.base_fare),
    costPerKm: Number(initial.tariff.cost_per_km),
    costPerMin: Number(initial.tariff.cost_per_min),
    minFare: Number(initial.tariff.min_fare),
  };
}

export default function DriverProfileForm({ initial }: DriverProfileFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(() => initial?.fullName ?? "");
  const [bio, setBio] = useState(() => initial?.bio ?? "");
  const [city, setCity] = useState(() => initial?.city ?? "");
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    () => initial?.vehicleType ?? "sedan"
  );
  const [vehicle, setVehicle] = useState<Vehicle | null>(() => toVehicle(initial));
  const [tariff, setTariff] = useState<DriverTariffConfig>(() => toTariff(initial));
  const [isVisible, setIsVisible] = useState(() => initial?.isVisible ?? false);
  const [acceptTerms, setAcceptTerms] = useState(() => initial?.termsAccepted ?? false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(() => initial?.photoUrl ?? null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const banned = initial?.banned ?? false;
  const nameValid = isValidName(fullName);
  const canSave = nameValid && vehicle !== null && acceptTerms && !banned;

  const handleVehicleTypeChange = (next: VehicleType) => {
    setVehicleType(next);
    setVehicle(null); // las marcas/modelos de un tipo no valen para otro
  };

  /**
   * Sube la foto al Storage (P4). La escribe el propio conductor (la RLS del bucket exige que la
   * ruta empiece por su uid). Se valida el tipo y el tamaño ANTES de subir.
   */
  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) return;

    setPhotoError(null);

    if (!file.type.startsWith("image/")) {
      setPhotoError("El archivo debe ser una imagen.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("La imagen no puede pesar más de 2 MB.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user === null) {
        setPhotoError("Inicia sesión para subir una foto.");
        return;
      }

      const ext = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "jpg";
      const path = `${auth.user.id}/avatar-${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from("driver-photos")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (error !== null) {
        setPhotoError("No se pudo subir la imagen. Inténtalo de nuevo.");
        return;
      }

      const { data: publicUrl } = supabase.storage.from("driver-photos").getPublicUrl(path);
      setPhotoUrl(publicUrl.publicUrl);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => {
    setPhotoUrl(null);
    setPhotoError(null);
    if (fileInputRef.current !== null) fileInputRef.current.value = "";
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setSucceeded(false);

    if (!canSave || vehicle === null) {
      setMessage("Completa tu nombre, el vehículo y acepta las normas.");
      return;
    }

    startTransition(async () => {
      const result = await saveDriverProfile({
        fullName: fullName.trim(),
        bio: bio.trim(),
        city: city.trim(),
        vehicleBrand: vehicle.brand,
        vehicleModel: vehicle.model,
        vehicleYear: vehicle.year,
        vehicleType: vehicle.vehicleType,
        isVisible,
        tariff,
        acceptTerms,
        photoUrl: photoUrl ?? "",
      });

      if (result.ok) {
        setSucceeded(true);
        setMessage("Ficha guardada correctamente.");
        router.refresh();
        return;
      }

      setMessage(result.error ?? "No se pudo guardar.");
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Datos del conductor</h2>

        <div className="grid gap-2">
          <Label htmlFor="driver-full-name">Nombre visible</Label>
          <Input
            id="driver-full-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Cómo te verán los clientes"
            autoComplete="name"
            className="min-h-11 text-base md:min-h-0 md:text-sm"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="driver-city">Ciudad / zona</Label>
          <Input
            id="driver-city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Ej: Caracas"
            className="min-h-11 text-base md:min-h-0 md:text-sm"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="driver-bio">Sobre ti (opcional)</Label>
          <textarea
            id="driver-bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Años de experiencia, zonas que cubres, trato, etc."
            className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          />
        </div>

        {/* Foto de perfil (P4). Se sube al Storage público; la escritura la limita la RLS del bucket. */}
        <div className="flex items-center gap-4">
          <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-accent text-accent-foreground">
            {photoUrl !== null ? (
              <Image
                src={photoUrl}
                alt="Tu foto de perfil"
                width={64}
                height={64}
                className="size-16 object-cover"
              />
            ) : (
              <Upload className="size-5" aria-hidden="true" />
            )}
          </span>

          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="size-4" aria-hidden="true" />
                )}
                {photoUrl !== null ? "Cambiar foto" : "Subir foto"}
              </Button>

              {photoUrl !== null && (
                <Button type="button" variant="ghost" size="sm" onClick={removePhoto}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  Quitar
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">JPG o PNG, máximo 2 MB.</p>
            {photoError !== null && (
              <p className="text-xs text-destructive" role="alert">
                {photoError}
              </p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="sr-only"
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Tu vehículo</h2>

        <div className="grid gap-2">
          <Label htmlFor="driver-vehicle-type">Tipo de vehículo</Label>
          <Select
            value={vehicleType}
            items={VEHICLE_LABELS}
            onValueChange={(value) => {
              if (value) handleVehicleTypeChange(value);
            }}
          >
            <SelectTrigger
              id="driver-vehicle-type"
              className="w-full min-h-11 text-base md:min-h-0 md:text-sm"
            >
              <SelectValue placeholder="Tipo de vehículo" />
            </SelectTrigger>
            <SelectContent side="bottom" sideOffset={4}>
              {VEHICLE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {formatVehicleType(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <VehicleSelector value={vehicle} onChange={setVehicle} vehicleType={vehicleType} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Tus tarifas</h2>
        <TariffEditor value={tariff} onChange={setTariff} />
      </section>

      <section className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={isVisible}
            onChange={(event) => setIsVisible(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span className="space-y-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              {isVisible ? (
                <Eye className="size-4" aria-hidden="true" />
              ) : (
                <EyeOff className="size-4" aria-hidden="true" />
              )}
              Publicar mi perfil
            </span>
            <span className="block text-xs text-muted-foreground">
              Si lo publicas, aparecerás en el listado de conductores y los clientes podrán ver tu
              ficha y dejarte reseñas.
            </span>
          </span>
        </label>
      </section>

      {/* T: normas obligatorias. Sin esto la RLS tampoco deja publicar, así que se pide aquí. */}
      <section className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(event) => setAcceptTerms(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span className="text-xs text-muted-foreground">
            He leído y acepto las{" "}
            <Link href="/normas" className="font-medium text-foreground underline underline-offset-4">
              normas de la comunidad
            </Link>{" "}
            y me comprometo a un uso responsable de Rumbo.
          </span>
        </label>
      </section>

      {banned && (
        <InlineMessage variant="error">
          Tu cuenta está suspendida y no puedes publicar. Escríbenos si crees que es un error.
        </InlineMessage>
      )}

      {message !== null && (
        <InlineMessage variant={succeeded ? "success" : "error"}>{message}</InlineMessage>
      )}

      <Button
        type="submit"
        className="min-h-12 w-full text-base font-semibold"
        disabled={pending || banned}
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Guardando…
          </>
        ) : (
          <>
            <Check className="size-4" aria-hidden="true" />
            Guardar ficha
          </>
        )}
      </Button>
    </form>
  );
}
