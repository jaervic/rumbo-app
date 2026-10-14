/**
 * Tipos de la base de datos de Supabase (Fase 1).
 *
 * Se escriben a mano con el MISMO formato que genera `supabase gen types typescript`, para que
 * `createClient<Database>(...)` dé tipos reales en consultas y `.insert()/.update()`. Cuando el
 * esquema cambie, o bien se regenera con el CLI, o se actualiza este archivo en el mismo commit.
 *
 * Convención: `Row` = lo que devuelve un SELECT, `Insert` = lo que acepta un INSERT (con defaults
 * opcionales) y `Update` = todo opcional.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Rol del usuario en la plataforma. */
export type UserRole = "driver" | "customer";
/** Tipo de vehículo en la base de datos (espejo de `VehicleType` de la app). */
export type DbVehicleType = "moto" | "sedan" | "suv" | "van";
/** Qué se puede reportar (T). */
export type ReportTargetType = "driver" | "review";
/** Estado de un reporte (T). */
export type ReportStatus = "open" | "resolved" | "dismissed";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          full_name: string;
          phone: string | null;
          avatar_url: string | null;
          /** Fecha en que aceptó las normas; `null` = todavía no puede publicar ni reseñar. */
          terms_accepted_at: string | null;
          banned: boolean;
          is_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: UserRole;
          full_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          terms_accepted_at?: string | null;
          banned?: boolean;
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          full_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          terms_accepted_at?: string | null;
          banned?: boolean;
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      drivers: {
        Row: {
          id: string;
          profile_id: string;
          bio: string;
          photo_url: string | null;
          vehicle_brand: string;
          vehicle_model: string;
          vehicle_year: number | null;
          vehicle_type: DbVehicleType;
          is_active: boolean;
          is_visible: boolean;
          /** Punto PostGIS (geography). El SDK lo entrega tal cual; se usa vía RPC, no en el cliente. */
          location: unknown | null;
          last_seen_at: string | null;
          city: string | null;
          rating_avg: number;
          rating_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          bio?: string;
          photo_url?: string | null;
          vehicle_brand?: string;
          vehicle_model?: string;
          vehicle_year?: number | null;
          vehicle_type?: DbVehicleType;
          is_active?: boolean;
          is_visible?: boolean;
          location?: unknown | null;
          last_seen_at?: string | null;
          city?: string | null;
          rating_avg?: number;
          rating_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          bio?: string;
          photo_url?: string | null;
          vehicle_brand?: string;
          vehicle_model?: string;
          vehicle_year?: number | null;
          vehicle_type?: DbVehicleType;
          is_active?: boolean;
          is_visible?: boolean;
          location?: unknown | null;
          last_seen_at?: string | null;
          city?: string | null;
          rating_avg?: number;
          rating_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drivers_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      driver_tariffs: {
        Row: {
          driver_id: string;
          base_fare: number;
          cost_per_km: number;
          cost_per_min: number;
          min_fare: number;
          updated_at: string;
        };
        Insert: {
          driver_id: string;
          base_fare: number;
          cost_per_km: number;
          cost_per_min: number;
          min_fare: number;
          updated_at?: string;
        };
        Update: {
          driver_id?: string;
          base_fare?: number;
          cost_per_km?: number;
          cost_per_min?: number;
          min_fare?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "driver_tariffs_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: true;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          id: string;
          driver_id: string;
          customer_id: string;
          rating: number;
          comment: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          driver_id: string;
          customer_id: string;
          rating: number;
          comment?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          driver_id?: string;
          customer_id?: string;
          rating?: number;
          comment?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          target_type: ReportTargetType;
          target_id: string;
          reason: string;
          details: string;
          status: ReportStatus;
          created_at: string;
          resolved_by: string | null;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          target_type: ReportTargetType;
          target_id: string;
          reason: string;
          details?: string;
          status?: ReportStatus;
          created_at?: string;
          resolved_by?: string | null;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          reporter_id?: string;
          target_type?: ReportTargetType;
          target_id?: string;
          reason?: string;
          details?: string;
          status?: ReportStatus;
          created_at?: string;
          resolved_by?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      nearby_drivers: {
        Args: {
          p_lat: number;
          p_lng: number;
          p_radius_km?: number;
          p_limit?: number;
        };
        Returns: {
          id: string;
          name: string;
          bio: string;
          city: string | null;
          photo_url: string | null;
          vehicle_brand: string;
          vehicle_model: string;
          vehicle_year: number | null;
          vehicle_type: DbVehicleType;
          rating_avg: number;
          rating_count: number;
          distance_km: number;
          latitude: number;
          longitude: number;
        }[];
      };
    };
    Enums: {
      user_role: UserRole;
      vehicle_type: DbVehicleType;
    };
    CompositeTypes: Record<string, never>;
  };
}

/** Atajos de las filas más usadas (Fase 2+). */
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Driver = Database["public"]["Tables"]["drivers"]["Row"];
export type DriverTariff = Database["public"]["Tables"]["driver_tariffs"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type Report = Database["public"]["Tables"]["reports"]["Row"];
export type AuditLog = Database["public"]["Tables"]["audit_log"]["Row"];
