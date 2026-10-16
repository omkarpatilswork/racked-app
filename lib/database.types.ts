// Hand-written to match supabase/migrations/*.sql. If you change the schema,
// update this file too (or generate it with `supabase gen types typescript`).
//
// Every table/view needs Row + Insert + Update + Relationships to satisfy
// @supabase/postgrest-js's GenericTable/GenericView shape — leaving one out
// (or using `never`) makes the whole entry resolve to `never` and every
// `.from(...)` call on it silently loses its types.

type NoWrite = Record<string, never>; // structurally empty -> .insert()/.update() calls won't typecheck

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          is_staff: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          avatar_url?: string | null;
          is_staff?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_url?: string | null;
          is_staff?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      machine_stats: {
        Row: {
          uid: string;
          machine_id: string;
          mode: string;
          pb_weight: number;
          pb_reps: number;
          sets: number;
          sessions: number;
          volume: number;
          xp: number;
          level: number;
          last_date: string;
          sets_today: number;
          updated_at: string;
        };
        Insert: NoWrite; // written only via the log_set() RPC
        Update: NoWrite;
        Relationships: [];
      };
      set_logs: {
        Row: {
          id: number;
          uid: string;
          machine_id: string;
          mode: string | null;
          weight: number;
          reps: number;
          volume: number;
          is_pb: boolean;
          xp_gain: number;
          created_at: string;
        };
        Insert: NoWrite; // written only via the log_set() RPC
        Update: NoWrite;
        Relationships: [];
      };
      attendance: {
        Row: {
          uid: string;
          date: string;
          present: boolean;
          updated_at: string;
        };
        Insert: {
          uid: string;
          date: string;
          present?: boolean;
          updated_at?: string;
        };
        Update: {
          uid?: string;
          date?: string;
          present?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      feedback: {
        Row: {
          id: number;
          uid: string | null;
          display_name: string;
          machine_id: string;
          rating: number;
          issues: string[];
          comment: string | null;
          status: "open" | "resolved" | "dismissed";
          created_at: string;
        };
        Insert: {
          uid?: string | null;
          display_name: string;
          machine_id: string;
          rating: number;
          issues?: string[];
          comment?: string | null;
          status?: "open" | "resolved" | "dismissed";
        };
        Update: {
          status?: "open" | "resolved" | "dismissed";
          comment?: string | null;
        };
        Relationships: [];
      };
      tap_events: {
        Row: {
          id: number;
          machine_id: string;
          uid: string | null;
          // How the person got into the machine: tapped its NFC sticker, scanned
          // its QR code, or "unknown" for scans recorded before this was tracked.
          source: "nfc" | "qr" | "unknown";
          created_at: string;
        };
        Insert: NoWrite; // written only via the record_tap() RPC
        Update: NoWrite;
        Relationships: [];
      };
    };
    Views: {
      v_overall_leaderboard: {
        Row: {
          uid: string;
          display_name: string;
          avatar_url: string | null;
          total_xp: number;
          total_sets: number;
          total_volume: number;
          pb_count: number;
          unlocked: number;
        };
        Relationships: [];
      };
      v_machine_leaderboard: {
        Row: {
          machine_id: string;
          mode: string;
          uid: string;
          display_name: string;
          avatar_url: string | null;
          pb_weight: number;
          pb_reps: number;
          xp: number;
          level: number;
          sets: number;
          rank: number;
        };
        Relationships: [];
      };
      v_admin_tap_counts: {
        Row: { machine_id: string; taps: number };
        Relationships: [];
      };
      v_admin_feedback_summary: {
        Row: { feedback_count: number; avg_rating: number | null; open_count: number };
        Relationships: [];
      };
      v_admin_set_logs: {
        Row: {
          id: number;
          uid: string;
          display_name: string;
          avatar_url: string | null;
          machine_id: string;
          mode: string | null;
          weight: number;
          reps: number;
          volume: number;
          is_pb: boolean;
          xp_gain: number;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      log_set: {
        Args: {
          p_machine_id: string;
          p_mode: string | null;
          p_weight: number;
          p_reps: number;
        };
        Returns: {
          isPb: boolean;
          weight: number;
          reps: number;
          pbWeight: number;
          pbReps: number;
          previousPb: { weight: number; reps: number } | null;
          xpGain: number;
          totalXp: number;
          totalSets: number;
          level: number;
        };
      };
      record_tap: {
        Args: { p_machine_id: string; p_source?: string };
        Returns: undefined;
      };
      // Period-scoped leaderboards (see supabase/migrations/0003_admin_tools.sql).
      // p_period is "today" | "week" | "month" | "all".
      leaderboard_overall: {
        Args: { p_period?: string };
        Returns: {
          uid: string;
          display_name: string;
          avatar_url: string | null;
          total_xp: number;
          total_sets: number;
          total_volume: number;
          pb_count: number;
          unlocked: number;
        }[];
      };
      leaderboard_machine: {
        Args: { p_machine_id: string; p_mode?: string; p_period?: string };
        Returns: {
          machine_id: string;
          mode: string;
          uid: string;
          display_name: string;
          avatar_url: string | null;
          pb_weight: number;
          pb_reps: number;
          xp: number;
          level: number;
          sets: number;
          rank: number;
        }[];
      };
      admin_delete_set_log: {
        Args: { p_id: number };
        Returns: undefined;
      };
      admin_delete_feedback: {
        Args: { p_id: number };
        Returns: undefined;
      };
      admin_clear_feedback: {
        Args: { p_machine_id?: string | null };
        Returns: undefined;
      };
      admin_reset_machine: {
        Args: { p_machine_id: string };
        Returns: undefined;
      };
      admin_reset_all_data: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
