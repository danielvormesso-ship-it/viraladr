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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      editor_activity: {
        Row: {
          action_type: string
          created_at: string
          details: Json | null
          id: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      editor_configs: {
        Row: {
          config: Json
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      editor_templates: {
        Row: {
          audio_file_path: string | null
          config: Json
          created_at: string
          id: string
          name: string
          popup_file_path: string | null
          popup_media_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_file_path?: string | null
          config?: Json
          created_at?: string
          id?: string
          name: string
          popup_file_path?: string | null
          popup_media_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_file_path?: string | null
          config?: Json
          created_at?: string
          id?: string
          name?: string
          popup_file_path?: string | null
          popup_media_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      hashtag_cache: {
        Row: {
          created_at: string
          hashtag: string
          id: string
          last_scraped_at: string
          videos_found: number
        }
        Insert: {
          created_at?: string
          hashtag: string
          id?: string
          last_scraped_at?: string
          videos_found?: number
        }
        Update: {
          created_at?: string
          hashtag?: string
          id?: string
          last_scraped_at?: string
          videos_found?: number
        }
        Relationships: []
      }
      kwai_videos: {
        Row: {
          author: string | null
          comments: number | null
          created_at: string
          duration: string | null
          id: string
          kwai_id: string | null
          likes: number | null
          shares: number | null
          source_url: string | null
          status: string | null
          thumbnail: string | null
          title: string
          updated_at: string
          video_url: string | null
          views: number | null
        }
        Insert: {
          author?: string | null
          comments?: number | null
          created_at?: string
          duration?: string | null
          id?: string
          kwai_id?: string | null
          likes?: number | null
          shares?: number | null
          source_url?: string | null
          status?: string | null
          thumbnail?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
          views?: number | null
        }
        Update: {
          author?: string | null
          comments?: number | null
          created_at?: string
          duration?: string | null
          id?: string
          kwai_id?: string | null
          likes?: number | null
          shares?: number | null
          source_url?: string | null
          status?: string | null
          thumbnail?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
          views?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved: boolean
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string
        }
        Insert: {
          approved?: boolean
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username: string
        }
        Update: {
          approved?: boolean
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      tiktok_videos: {
        Row: {
          author: string | null
          comments: number | null
          created_at: string
          duration: string | null
          hashtag: string | null
          id: string
          likes: number | null
          owner_user_id: string | null
          shares: number | null
          source_url: string | null
          status: string | null
          thumbnail: string | null
          tiktok_id: string | null
          title: string
          updated_at: string
          video_url: string | null
          views: number | null
        }
        Insert: {
          author?: string | null
          comments?: number | null
          created_at?: string
          duration?: string | null
          hashtag?: string | null
          id?: string
          likes?: number | null
          owner_user_id?: string | null
          shares?: number | null
          source_url?: string | null
          status?: string | null
          thumbnail?: string | null
          tiktok_id?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
          views?: number | null
        }
        Update: {
          author?: string | null
          comments?: number | null
          created_at?: string
          duration?: string | null
          hashtag?: string | null
          id?: string
          likes?: number | null
          owner_user_id?: string | null
          shares?: number | null
          source_url?: string | null
          status?: string | null
          thumbnail?: string | null
          tiktok_id?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
          views?: number | null
        }
        Relationships: []
      }
      trending_hashtags: {
        Row: {
          category: string
          created_at: string
          discovered_by: string | null
          emoji: string | null
          id: string
          is_global: boolean | null
          label: string
          last_discovered_at: string
          popularity_score: number | null
          related_tags: string[] | null
          tag: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          discovered_by?: string | null
          emoji?: string | null
          id?: string
          is_global?: boolean | null
          label: string
          last_discovered_at?: string
          popularity_score?: number | null
          related_tags?: string[] | null
          tag: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          discovered_by?: string | null
          emoji?: string | null
          id?: string
          is_global?: boolean | null
          label?: string
          last_discovered_at?: string
          popularity_score?: number | null
          related_tags?: string[] | null
          tag?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_assignments: {
        Row: {
          assigned_at: string
          editor_name: string
          id: string
          video_id: string
        }
        Insert: {
          assigned_at?: string
          editor_name: string
          id?: string
          video_id: string
        }
        Update: {
          assigned_at?: string
          editor_name?: string
          id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_assignments_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "tiktok_videos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "editor"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "editor"],
    },
  },
} as const
