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
  public: {
    Tables: {
      advertisements: {
        Row: {
          alt_text: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          image_mobile_url: string | null
          image_url: string
          is_active: boolean
          link_url: string | null
          localities: string[]
          priority: number
          scope: string
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          alt_text: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          image_mobile_url?: string | null
          image_url: string
          is_active?: boolean
          link_url?: string | null
          localities?: string[]
          priority?: number
          scope?: string
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          alt_text?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          image_mobile_url?: string | null
          image_url?: string
          is_active?: boolean
          link_url?: string | null
          localities?: string[]
          priority?: number
          scope?: string
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advertisements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advertisements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_localities: {
        Row: {
          category: string
          code: string
          kind: string
          name: string
          province_code: string
        }
        Insert: {
          category: string
          code: string
          kind: string
          name: string
          province_code: string
        }
        Update: {
          category?: string
          code?: string
          kind?: string
          name?: string
          province_code?: string
        }
        Relationships: []
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
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
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
      booking_price_changes: {
        Row: {
          booking_id: string
          changed_at: string
          currency: string
          new_total: number
          notified_at: string | null
          old_total: number
          user_id: string
        }
        Insert: {
          booking_id: string
          changed_at?: string
          currency?: string
          new_total: number
          notified_at?: string | null
          old_total: number
          user_id: string
        }
        Update: {
          booking_id?: string
          changed_at?: string
          currency?: string
          new_total?: number
          notified_at?: string | null
          old_total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_price_changes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_price_changes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_price_changes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "profile_directory"
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
            referencedRelation: "profile_directory"
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
      business_totals_audit: {
        Row: {
          checked_at: string
          drift: Json
          id: number
        }
        Insert: {
          checked_at?: string
          drift: Json
          id?: never
        }
        Update: {
          checked_at?: string
          drift?: Json
          id?: never
        }
        Relationships: []
      }
      business_totals_shards: {
        Row: {
          collected: number
          commission: number
          in_wallets: number
          paid_to_venues: number
          pending_to_venues: number
          played: number
          slot: number
          spent_net: number
        }
        Insert: {
          collected?: number
          commission?: number
          in_wallets?: number
          paid_to_venues?: number
          pending_to_venues?: number
          played?: number
          slot: number
          spent_net?: number
        }
        Update: {
          collected?: number
          commission?: number
          in_wallets?: number
          paid_to_venues?: number
          pending_to_venues?: number
          played?: number
          slot?: number
          spent_net?: number
        }
        Relationships: []
      }
      class_bookings: {
        Row: {
          base_price: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          class_id: string
          commission_amount: number
          created_at: string
          created_by: string | null
          id: string
          paid_at: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          reminder_sent_at: string | null
          status: Database["public"]["Enums"]["booking_status"]
          total_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          base_price: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_role?: string | null
          class_id: string
          commission_amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          reminder_sent_at?: string | null
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
          cancelled_by_role?: string | null
          class_id?: string
          commission_amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          reminder_sent_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          total_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bookings_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "trainer_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bookings_user_id_fkey"
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
            referencedRelation: "profile_directory"
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
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "profile_directory"
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
          class_durations: number[]
          class_max_students: number
          classes_enabled: boolean
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
          class_durations?: number[]
          class_max_students?: number
          classes_enabled?: boolean
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
          class_durations?: number[]
          class_max_students?: number
          classes_enabled?: boolean
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
      trainer_blocks: {
        Row: {
          created_at: string
          end_date: string
          id: string
          reason: string | null
          start_date: string
          trainer_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          reason?: string | null
          start_date: string
          trainer_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          reason?: string | null
          start_date?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_blocks_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      trainer_classes: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          capacity: number
          created_at: string
          end_datetime: string
          hours: number
          id: string
          is_group: boolean
          location: string
          slot_id: string | null
          sport_id: string
          start_datetime: string
          status: Database["public"]["Enums"]["class_status"]
          trainer_id: string
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          capacity: number
          created_at?: string
          end_datetime: string
          hours: number
          id?: string
          is_group: boolean
          location: string
          slot_id?: string | null
          sport_id: string
          start_datetime: string
          status?: Database["public"]["Enums"]["class_status"]
          trainer_id: string
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          capacity?: number
          created_at?: string
          end_datetime?: string
          hours?: number
          id?: string
          is_group?: boolean
          location?: string
          slot_id?: string | null
          sport_id?: string
          start_datetime?: string
          status?: Database["public"]["Enums"]["class_status"]
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_classes_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_classes_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_classes_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "trainer_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_classes_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_classes_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      trainer_slot_sports: {
        Row: {
          slot_id: string
          sport_id: string
        }
        Insert: {
          slot_id: string
          sport_id: string
        }
        Update: {
          slot_id?: string
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_slot_sports_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "trainer_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_slot_sports_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_slots: {
        Row: {
          commission_percent: number
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          location: string
          rate_group: number | null
          rate_individual: number
          start_time: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          commission_percent?: number
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          location: string
          rate_group?: number | null
          rate_individual: number
          start_time: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          commission_percent?: number
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          location?: string
          rate_group?: number | null
          rate_individual?: number
          start_time?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_slots_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      trainer_sports: {
        Row: {
          sport_id: string
          trainer_id: string
        }
        Insert: {
          sport_id: string
          trainer_id: string
        }
        Update: {
          sport_id?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_sports_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_sports_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      trainers: {
        Row: {
          bio: string | null
          created_at: string
          created_by: string | null
          experience: string | null
          published_at: string | null
          status: Database["public"]["Enums"]["trainer_status"]
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          created_by?: string | null
          experience?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["trainer_status"]
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          created_by?: string | null
          experience?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["trainer_status"]
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_ledger: {
        Row: {
          amount: number
          booking_id: string | null
          commission: number
          created_at: string
          detail: string
          id: string
          kind: Database["public"]["Enums"]["venue_ledger_kind"]
          period: string
          settlement_id: string | null
          venue_id: string
        }
        Insert: {
          amount: number
          booking_id?: string | null
          commission?: number
          created_at?: string
          detail: string
          id?: string
          kind: Database["public"]["Enums"]["venue_ledger_kind"]
          period: string
          settlement_id?: string | null
          venue_id: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          commission?: number
          created_at?: string
          detail?: string
          id?: string
          kind?: Database["public"]["Enums"]["venue_ledger_kind"]
          period?: string
          settlement_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_ledger_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_ledger_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "venue_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_ledger_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_payout_requests: {
        Row: {
          amount: number
          id: string
          reject_reason: string | null
          requested_at: string
          requested_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          settlement_id: string | null
          status: Database["public"]["Enums"]["payout_request_status"]
          venue_id: string
        }
        Insert: {
          amount: number
          id?: string
          reject_reason?: string | null
          requested_at?: string
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          settlement_id?: string | null
          status?: Database["public"]["Enums"]["payout_request_status"]
          venue_id: string
        }
        Update: {
          amount?: number
          id?: string
          reject_reason?: string | null
          requested_at?: string
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          settlement_id?: string | null
          status?: Database["public"]["Enums"]["payout_request_status"]
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_payout_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_payout_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_payout_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_payout_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_payout_requests_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "venue_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_payout_requests_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_settlements: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          period: string
          receipt_path: string | null
          transfer_ref: string | null
          venue_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          period: string
          receipt_path?: string | null
          transfer_ref?: string | null
          venue_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          period?: string
          receipt_path?: string | null
          transfer_ref?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_settlements_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
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
          city: string
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
        Relationships: [
          {
            foreignKeyName: "venues_locality_code_fkey"
            columns: ["locality_code"]
            isOneToOne: false
            referencedRelation: "ar_localities"
            referencedColumns: ["code"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          booking_id: string | null
          class_booking_id: string | null
          created_at: string
          created_by: string | null
          detail: string
          id: string
          kind: Database["public"]["Enums"]["wallet_tx_kind"]
          reason: string | null
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          booking_id?: string | null
          class_booking_id?: string | null
          created_at?: string
          created_by?: string | null
          detail: string
          id?: string
          kind: Database["public"]["Enums"]["wallet_tx_kind"]
          reason?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          booking_id?: string | null
          class_booking_id?: string | null
          created_at?: string
          created_by?: string | null
          detail?: string
          id?: string
          kind?: Database["public"]["Enums"]["wallet_tx_kind"]
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_class_booking_id_fkey"
            columns: ["class_booking_id"]
            isOneToOne: false
            referencedRelation: "class_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profile_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profile_directory: {
        Row: {
          email: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
        }
        Insert: {
          email?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
        }
        Update: {
          email?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_balances_summary: { Args: never; Returns: Json }
      admin_classes: {
        Args: {
          p_from?: string
          p_page?: number
          p_size?: number
          p_sport?: string
          p_status?: string
          p_to?: string
          p_trainer?: string
        }
        Returns: Json
      }
      admin_list_bookings: {
        Args: {
          p_from?: string
          p_page?: number
          p_per_page?: number
          p_search?: string
          p_state?: string
          p_to?: string
        }
        Returns: Json
      }
      admin_lookup_client: {
        Args: { p_dni?: string; p_email?: string }
        Returns: Json
      }
      admin_payout_pending_count: { Args: never; Returns: number }
      admin_payout_requests: { Args: { p_venue?: string }; Returns: Json }
      admin_points_users: {
        Args: { p_page?: number; p_search?: string; p_size?: number }
        Returns: Json
      }
      admin_set_slot_commission: {
        Args: { p_percent: number; p_slot: string }
        Returns: Json
      }
      admin_set_trainer_status: {
        Args: { p_reason: string; p_suspend: boolean; p_trainer: string }
        Returns: Json
      }
      admin_trainer_detail: { Args: { p_trainer: string }; Returns: Json }
      admin_trainers: {
        Args: {
          p_page?: number
          p_search?: string
          p_size?: number
          p_status?: string
        }
        Returns: Json
      }
      admin_venue_balances: {
        Args: { p_page?: number; p_size?: number; p_venue?: string }
        Returns: Json
      }
      admin_venue_payments: {
        Args: {
          p_from?: string
          p_page?: number
          p_search?: string
          p_size?: number
          p_to?: string
          p_venue?: string
        }
        Returns: Json
      }
      admin_wallet_history: {
        Args: {
          p_from?: string
          p_kind?: string
          p_page?: number
          p_size?: number
          p_to?: string
          p_user?: string
          p_venue?: string
        }
        Returns: Json
      }
      ar_date: { Args: { p_ts: string }; Returns: string }
      ar_day_key: { Args: { ts: string }; Returns: string }
      ar_day_start: { Args: { p_day: string }; Returns: string }
      ar_midnight_utc: { Args: { date_str: string }; Returns: string }
      ar_month: { Args: { p_ts: string }; Returns: string }
      ar_province_codes: { Args: never; Returns: string[] }
      ar_province_name: { Args: { p_code: string }; Returns: string }
      book_class: {
        Args: {
          p_by: string
          p_expected: number
          p_hours: number
          p_sport: string
          p_start: string
          p_trainer: string
          p_user: string
        }
        Returns: Json
      }
      booking_label: { Args: { p_booking: string }; Returns: string }
      bt_apply: {
        Args: {
          d_collected: number
          d_commission: number
          d_in_wallets: number
          d_paid: number
          d_pending: number
          d_played: number
          d_spent_net: number
        }
        Returns: undefined
      }
      bt_slot: { Args: never; Returns: number }
      business_totals_verify: { Args: never; Returns: Json }
      calculate_price: {
        Args: { p_facility_id: string; p_start_datetime: string }
        Returns: Json
      }
      cancel_booking: {
        Args: { p_booking: string; p_by: string; p_reason: string }
        Returns: Json
      }
      cancel_class_booking: {
        Args: { p_by: string; p_id: string; p_reason: string }
        Returns: Json
      }
      cancel_trainer_class: {
        Args: { p_by: string; p_class: string; p_reason: string }
        Returns: Json
      }
      class_actor_role: {
        Args: { p_by: string; p_owner: string; p_trainer: string }
        Returns: string
      }
      class_booking_do_cancel: {
        Args: { p_by: string; p_id: string; p_reason: string; p_role: string }
        Returns: number
      }
      class_json: { Args: { p_class: string; p_view: string }; Returns: Json }
      class_label: { Args: { p_class: string }; Returns: string }
      class_options: {
        Args: {
          p_day: string
          p_hours: number
          p_sport: string
          p_trainer: string
          p_user: string
        }
        Returns: {
          already: boolean
          base: number
          capacity: number
          class_id: string
          commission: number
          end_at: string
          is_group: boolean
          location: string
          slot_id: string
          start_at: string
          taken: number
          total: number
        }[]
      }
      clock_minutes: { Args: { p: string }; Returns: number }
      close_empty_class: {
        Args: { p_by: string; p_class: string }
        Returns: undefined
      }
      complete_past_bookings: { Args: never; Returns: number }
      create_booking_paid: {
        Args: {
          p_by: string
          p_end: string
          p_facility: string
          p_notes: string
          p_start: string
          p_user: string
        }
        Returns: string
      }
      emit_payout_notification: {
        Args: {
          p_admin: boolean
          p_body: string
          p_data: Json
          p_title: string
          p_type: Database["public"]["Enums"]["notification_type"]
          p_venue: string
        }
        Returns: undefined
      }
      fmt_ar_datetime: { Args: { p_ts: string }; Returns: string }
      fmt_points: { Args: { p: number }; Returns: string }
      get_active_advertisements: {
        Args: { p_locality?: string }
        Returns: {
          alt_text: string
          id: string
          image_mobile_url: string
          image_url: string
          link_url: string
          scope: string
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
      lock_venue_payouts: { Args: { p_venue: string }; Returns: undefined }
      my_booking_stats: { Args: never; Returns: Json }
      my_class_bookings: {
        Args: { p_page?: number; p_scope?: string; p_size?: number }
        Returns: Json
      }
      my_wallet_history: {
        Args: {
          p_from?: string
          p_kind?: string
          p_page?: number
          p_size?: number
          p_to?: string
        }
        Returns: Json
      }
      owns_venue: { Args: { p_venue_id: string }; Returns: boolean }
      pay_booking: {
        Args: { p_booking: string; p_expected: number; p_user: string }
        Returns: Json
      }
      pay_bookings_batch: {
        Args: { p_bookings: string[]; p_user: string }
        Returns: Json
      }
      pay_venue: {
        Args: {
          p_amount: number
          p_receipt_path: string
          p_request: string
          p_transfer_ref: string
          p_venue: string
        }
        Returns: Json
      }
      pricing_default_commission: {
        Args: { p_facility: string }
        Returns: number
      }
      reject_venue_payout: {
        Args: { p_reason: string; p_request: string }
        Returns: Json
      }
      reprice_pending_recurring: {
        Args: { p_facility_id: string }
        Returns: number
      }
      request_venue_payout: { Args: { p_amount?: number }; Returns: Json }
      require_trainer: { Args: never; Returns: string }
      search_trainers: {
        Args: {
          p_dow?: number
          p_max?: number
          p_min?: number
          p_page?: number
          p_size?: number
          p_sport?: string
        }
        Returns: Json
      }
      server_now: { Args: never; Returns: string }
      set_user_role: {
        Args: { p_role: string; p_user_id: string; p_venue_id?: string }
        Returns: Json
      }
      trainer_add_block: {
        Args: { p_end: string; p_reason: string; p_start: string }
        Returns: Json
      }
      trainer_availability: {
        Args: {
          p_date: string
          p_hours: number
          p_sport: string
          p_trainer: string
        }
        Returns: Json
      }
      trainer_delete_block: { Args: { p_id: string }; Returns: Json }
      trainer_delete_slot: { Args: { p_id: string }; Returns: Json }
      trainer_final_rate: {
        Args: { p_percent: number; p_rate: number }
        Returns: number
      }
      trainer_is_public: { Args: { p_trainer: string }; Returns: boolean }
      trainer_my_classes: {
        Args: { p_page?: number; p_scope?: string; p_size?: number }
        Returns: Json
      }
      trainer_my_panel: { Args: never; Returns: Json }
      trainer_panel_json: {
        Args: { p_trainer: string; p_with_commission: boolean }
        Returns: Json
      }
      trainer_public_profile: { Args: { p_trainer: string }; Returns: Json }
      trainer_publish_problems: {
        Args: { p_trainer: string }
        Returns: string[]
      }
      trainer_save_slot: {
        Args: {
          p_day: number
          p_end: string
          p_id: string
          p_location: string
          p_rate_group: number
          p_rate_individual: number
          p_sport_ids: string[]
          p_start: string
        }
        Returns: Json
      }
      trainer_set_published: { Args: { p_publish: boolean }; Returns: Json }
      trainer_slots_overlap: {
        Args: {
          d1: number
          d2: number
          e1: string
          e2: string
          s1: string
          s2: string
        }
        Returns: boolean
      }
      trainer_upsert_profile: {
        Args: { p_bio: string; p_experience: string; p_sport_ids: string[] }
        Returns: Json
      }
      venue_admin_can_see_profile: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      venue_balance_info: {
        Args: { p_venue: string }
        Returns: Record<string, unknown>
      }
      venue_wallet: {
        Args: {
          p_from?: string
          p_kind?: string
          p_page?: number
          p_size?: number
          p_to?: string
          p_venue?: string
        }
        Returns: Json
      }
      wallet_admin_adjust: {
        Args: { p_amount: number; p_reason: string; p_user: string }
        Returns: Json
      }
      wallet_apply: {
        Args: {
          p_amount: number
          p_booking: string
          p_by: string
          p_detail: string
          p_kind: Database["public"]["Enums"]["wallet_tx_kind"]
          p_reason: string
          p_user: string
        }
        Returns: number
      }
      wallet_apply_class: {
        Args: {
          p_amount: number
          p_by: string
          p_class_booking: string
          p_detail: string
          p_kind: Database["public"]["Enums"]["wallet_tx_kind"]
          p_user: string
        }
        Returns: number
      }
    }
    Enums: {
      billing_type: "PER_SESSION" | "MONTHLY"
      booking_status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED"
      class_status: "OPEN" | "CANCELLED" | "COMPLETED"
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
        | "PAYOUT_REQUESTED"
        | "PAYOUT_PAID"
        | "PAYOUT_REJECTED"
      payment_status: "PENDING" | "PAID"
      payout_request_status: "PENDING" | "PAID" | "REJECTED"
      role: "CLIENT" | "ADMIN" | "VENUE_ADMIN" | "TRAINER"
      trainer_status: "DRAFT" | "PUBLISHED" | "SUSPENDED"
      venue_ledger_kind: "BOOKING_CREDIT" | "SETTLEMENT"
      wallet_tx_kind:
        | "TOPUP"
        | "ADJUSTMENT"
        | "BOOKING_PAYMENT"
        | "BOOKING_REFUND"
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
  public: {
    Enums: {
      billing_type: ["PER_SESSION", "MONTHLY"],
      booking_status: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"],
      class_status: ["OPEN", "CANCELLED", "COMPLETED"],
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
        "PAYOUT_REQUESTED",
        "PAYOUT_PAID",
        "PAYOUT_REJECTED",
      ],
      payment_status: ["PENDING", "PAID"],
      payout_request_status: ["PENDING", "PAID", "REJECTED"],
      role: ["CLIENT", "ADMIN", "VENUE_ADMIN", "TRAINER"],
      trainer_status: ["DRAFT", "PUBLISHED", "SUSPENDED"],
      venue_ledger_kind: ["BOOKING_CREDIT", "SETTLEMENT"],
      wallet_tx_kind: [
        "TOPUP",
        "ADJUSTMENT",
        "BOOKING_PAYMENT",
        "BOOKING_REFUND",
      ],
    },
  },
} as const
