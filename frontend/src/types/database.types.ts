export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      advertisements: {
        Row: {
          created_at: string
          created_by: string | null
          cta_label: string | null
          description: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          link_url: string | null
          priority: number
          localities: string[]
          scope: string
          starts_at: string | null
          subtitle: string | null
          theme: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          link_url?: string | null
          priority?: number
          localities?: string[]
          scope?: string
          starts_at?: string | null
          subtitle?: string | null
          theme?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          link_url?: string | null
          priority?: number
          localities?: string[]
          scope?: string
          starts_at?: string | null
          subtitle?: string | null
          theme?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advertisements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_slots: {
        Row: {
          created_at: string
          created_by: string
          end_datetime: string
          facility_id: string
          id: string
          reason: string | null
          start_datetime: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          end_datetime: string
          facility_id: string
          id?: string
          reason?: string | null
          start_datetime: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          end_datetime?: string
          facility_id?: string
          id?: string
          reason?: string | null
          start_datetime?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_slots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_slots_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          base_price: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          commission_amount: number
          created_at: string
          created_by: string
          currency: string
          end_datetime: string
          facility_id: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          recurring_booking_id: string | null
          reminder_sent_at: string | null
          start_datetime: string
          status: Database["public"]["Enums"]["booking_status"]
          total_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          base_price?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          commission_amount?: number
          created_at?: string
          created_by: string
          currency?: string
          end_datetime: string
          facility_id: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          recurring_booking_id?: string | null
          reminder_sent_at?: string | null
          start_datetime: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          base_price?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          commission_amount?: number
          created_at?: string
          created_by?: string
          currency?: string
          end_datetime?: string
          facility_id?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          recurring_booking_id?: string | null
          reminder_sent_at?: string | null
          start_datetime?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_recurring_booking_id_fkey"
            columns: ["recurring_booking_id"]
            isOneToOne: false
            referencedRelation: "recurring_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facilities: {
        Row: {
          capacity: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_indoor: boolean
          max_booking_duration: number
          min_booking_duration: number
          name: string
          sport_id: string
          surface_type: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_indoor?: boolean
          max_booking_duration: number
          min_booking_duration: number
          name: string
          sport_id: string
          surface_type?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_indoor?: boolean
          max_booking_duration?: number
          min_booking_duration?: number
          name?: string
          sport_id?: string
          surface_type?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facilities_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facilities_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          id: string
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          admin_only: boolean
          body: string
          booking_id: string | null
          created_at: string
          data: Json | null
          id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          venue_id: string | null
        }
        Insert: {
          admin_only?: boolean
          body: string
          booking_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          venue_id?: string | null
        }
        Update: {
          admin_only?: boolean
          body?: string
          booking_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing: {
        Row: {
          created_at: string
          currency: string
          day_of_week: number | null
          end_time: string
          facility_id: string
          id: string
          is_active: boolean
          price_per_hour: number
          profit_percent: number
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          day_of_week?: number | null
          end_time: string
          facility_id: string
          id?: string
          is_active?: boolean
          price_per_hour: number
          profit_percent?: number
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          day_of_week?: number | null
          end_time?: string
          facility_id?: string
          id?: string
          is_active?: boolean
          price_per_hour?: number
          profit_percent?: number
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          dni: string | null
          email: string | null
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          phone: string | null
          province: string | null
          role: Database["public"]["Enums"]["role"]
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          dni?: string | null
          email?: string | null
          first_name?: string
          id: string
          is_active?: boolean
          last_name?: string
          phone?: string | null
          province?: string | null
          role?: Database["public"]["Enums"]["role"]
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          dni?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          phone?: string | null
          province?: string | null
          role?: Database["public"]["Enums"]["role"]
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_bookings: {
        Row: {
          created_at: string
          created_by: string
          day_of_week: number
          end_date: string
          end_time: string
          facility_id: string
          id: string
          is_active: boolean
          start_date: string
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          day_of_week: number
          end_date: string
          end_time: string
          facility_id: string
          id?: string
          is_active?: boolean
          start_date: string
          start_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          day_of_week?: number
          end_date?: string
          end_time?: string
          facility_id?: string
          id?: string
          is_active?: boolean
          start_date?: string
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_bookings_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          close_time: string
          created_at: string
          day_of_week: number
          facility_id: string
          id: string
          is_active: boolean
          open_time: string
          updated_at: string
        }
        Insert: {
          close_time: string
          created_at?: string
          day_of_week: number
          facility_id: string
          id?: string
          is_active?: boolean
          open_time: string
          updated_at?: string
        }
        Update: {
          close_time?: string
          created_at?: string
          day_of_week?: number
          facility_id?: string
          id?: string
          is_active?: boolean
          open_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      sports: {
        Row: {
          billing_type: Database["public"]["Enums"]["billing_type"]
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_players: number | null
          name: string
          updated_at: string
        }
        Insert: {
          billing_type?: Database["public"]["Enums"]["billing_type"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_players?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          billing_type?: Database["public"]["Enums"]["billing_type"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_players?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      venue_sports: {
        Row: {
          sport_id: string
          venue_id: string
        }
        Insert: {
          sport_id: string
          venue_id: string
        }
        Update: {
          sport_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_sports_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_sports_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string
          amenities: string[]
          city: string
          country: string
          created_at: string
          description: string | null
          email: string | null
          id: string
          image_url: string | null
          is_active: boolean
          latitude: number | null
          locality_code: string | null
          longitude: number | null
          name: string
          phone: string | null
          slug: string
          state: string | null
          updated_at: string
        }
        Insert: {
          address: string
          amenities?: string[]
          // La completa la base desde locality_code (trigger venue_fill_municipality, 041)
          city?: string
          country: string
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          latitude?: number | null
          locality_code?: string | null
          longitude?: number | null
          name: string
          phone?: string | null
          slug: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          amenities?: string[]
          city?: string
          country?: string
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          latitude?: number | null
          locality_code?: string | null
          longitude?: number | null
          name?: string
          phone?: string | null
          slug?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ar_day_key: { Args: { ts: string }; Returns: string }
      ar_midnight_utc: { Args: { date_str: string }; Returns: string }
      ar_province_codes: { Args: never; Returns: string[] }
      calculate_price: {
        Args: { p_facility_id: string; p_start_datetime: string }
        Returns: Json
      }
      get_active_advertisements: {
        Args: { p_locality?: string }
        Returns: {
          cta_label: string
          description: string
          id: string
          link_url: string
          scope: string
          subtitle: string
          theme: string
          title: string
        }[]
      }
      get_availability: {
        Args: { p_date: string; p_facility_id: string }
        Returns: Json
      }
      get_availability_summary: {
        Args: { p_date?: string; p_sport_id?: string; p_venue_id?: string }
        Returns: Json
      }
      get_my_role: { Args: never; Returns: string }
      get_my_venue_id: { Args: never; Returns: string }
      get_stats: {
        Args: {
          p_from?: string
          p_range?: string
          p_sport_id?: string
          p_status?: string
          p_to?: string
          p_venue_id?: string
        }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_venue_admin: { Args: never; Returns: boolean }
      is_facility_bookable: {
        Args: { p_facility_id: string }
        Returns: boolean
      }
      is_venue_admin: { Args: never; Returns: boolean }
      owns_venue: { Args: { p_venue_id: string }; Returns: boolean }
      set_user_role: {
        Args: { p_role: string; p_user_id: string; p_venue_id?: string }
        Returns: Json
      }
      venue_admin_can_see_profile: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
    }
    Enums: {
      billing_type: "PER_SESSION" | "MONTHLY"
      booking_status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED"
      notification_type:
        | "BOOKING_CREATED"
        | "BOOKING_PAID"
        | "BOOKING_CANCELLED"
        | "BOOKING_AUTO_CANCELLED"
        | "RECURRING_CREATED"
        | "NEW_CLIENT"
        | "COMMISSION_EARNED"
        | "VENUE_OR_FACILITY_CREATED"
        | "USER_REGISTERED"
      payment_status: "PENDING" | "PAID"
      role: "CLIENT" | "ADMIN" | "VENUE_ADMIN"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      billing_type: ["PER_SESSION", "MONTHLY"],
      booking_status: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"],
      notification_type: [
        "BOOKING_CREATED",
        "BOOKING_PAID",
        "BOOKING_CANCELLED",
        "BOOKING_AUTO_CANCELLED",
        "RECURRING_CREATED",
        "NEW_CLIENT",
        "COMMISSION_EARNED",
        "VENUE_OR_FACILITY_CREATED",
        "USER_REGISTERED",
      ],
      payment_status: ["PENDING", "PAID"],
      role: ["CLIENT", "ADMIN", "VENUE_ADMIN"],
    },
  },
} as const
