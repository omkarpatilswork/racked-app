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
          instagram_handle: string | null;
          is_staff: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          avatar_url?: string | null;
          instagram_handle?: string | null;
          is_staff?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_url?: string | null;
          instagram_handle?: string | null;
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
      pump_photos: {
        Row: {
          id: number;
          uid: string;
          kind: "pre" | "post";
          day: string; // yyyy-mm-dd
          path: string; // <uid>/<file> in the private "pump-photos" bucket
          shared: boolean; // appears in the gym feed
          hidden: boolean; // hidden by reports / staff
          created_at: string;
        };
        Insert: NoWrite; // written only via add_pump_photo()
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
      // Public gym-TV feeds (see supabase/migrations/0005_tv_display.sql).
      // Callable without logging in; return first names / anonymous counts only.
      tv_boards: {
        Args: { p_period?: string; p_limit?: number };
        Returns: {
          machine_id: string;
          mode: string;
          rank: number;
          name: string;
          pb_weight: number;
          pb_reps: number;
          sets: number;
        }[];
      };
      tv_activity: {
        Args: { p_period?: string };
        Returns: {
          person: number;
          machine_id: string;
          mode: string;
          sets: number;
          volume: number;
          pbs: number;
        }[];
      };
      // Home feed + kudos (see supabase/migrations/0006_home_feed.sql).
      // Signed-in members only.
      feed_posts: {
        Args: { p_limit?: number; p_before?: string | null };
        Returns: {
          post_id: number;
          is_mine: boolean;
          display_name: string;
          avatar_url: string | null;
          instagram_handle: string | null;
          machine_id: string;
          mode: string;
          sets: number;
          weight: number;
          reps: number;
          volume: number;
          xp: number;
          has_pb: boolean;
          started_at: string;
          created_at: string;
          kudos_count: number;
          kudos_mine: boolean;
          kudos_names: string[];
        }[];
      };
      set_instagram_handle: {
        Args: { p_handle: string };
        Returns: string | null;
      };
      toggle_kudos: {
        Args: { p_post_id: number };
        Returns: { count: number; mine: boolean };
      };
      // Pre/post pump photos (see supabase/migrations/0007_pump_photos.sql).
      add_pump_photo: {
        Args: { p_kind: string; p_path: string; p_shared?: boolean; p_day?: string | null };
        Returns: { id: number; old_path: string | null };
      };
      set_pump_photo_shared: {
        Args: { p_id: number; p_shared: boolean };
        Returns: undefined;
      };
      delete_pump_photo: {
        Args: { p_id: number };
        Returns: string;
      };
      report_photos: {
        Args: { p_ids: number[]; p_reason?: string | null };
        Returns: undefined;
      };
      feed_photos: {
        Args: { p_limit?: number; p_before?: string | null };
        Returns: {
          item_id: number;
          is_mine: boolean;
          display_name: string;
          avatar_url: string | null;
          instagram_handle: string | null;
          day: string;
          pre_photo_id: number | null;
          pre_path: string | null;
          post_photo_id: number | null;
          post_path: string | null;
          created_at: string;
          kudos_count: number;
          kudos_mine: boolean;
          kudos_names: string[];
        }[];
      };
      toggle_photo_kudos: {
        Args: { p_item_id: number };
        Returns: { count: number; mine: boolean };
      };
      admin_pump_reports: {
        Args: Record<string, never>;
        Returns: {
          id: number;
          display_name: string;
          kind: "pre" | "post";
          day: string;
          path: string;
          shared: boolean;
          hidden: boolean;
          report_count: number;
          reasons: string[];
          created_at: string;
        }[];
      };
      admin_set_photo_hidden: {
        Args: { p_id: number; p_hidden: boolean };
        Returns: undefined;
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
