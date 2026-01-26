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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          icon: string
          id: string
          is_secret: boolean | null
          name: string
          points: number | null
          requirement_type: string
          requirement_value: number
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_secret?: boolean | null
          name: string
          points?: number | null
          requirement_type: string
          requirement_value: number
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_secret?: boolean | null
          name?: string
          points?: number | null
          requirement_type?: string
          requirement_value?: number
        }
        Relationships: []
      }
      annotations: {
        Row: {
          annotation_type: string | null
          book_id: string
          created_at: string
          emoji_reaction: string | null
          highlight_color: string
          id: string
          note: string | null
          page_number: number
          position_data: Json | null
          selected_text: string
          updated_at: string
          user_id: string
          voice_note_url: string | null
        }
        Insert: {
          annotation_type?: string | null
          book_id: string
          created_at?: string
          emoji_reaction?: string | null
          highlight_color?: string
          id?: string
          note?: string | null
          page_number: number
          position_data?: Json | null
          selected_text: string
          updated_at?: string
          user_id: string
          voice_note_url?: string | null
        }
        Update: {
          annotation_type?: string | null
          book_id?: string
          created_at?: string
          emoji_reaction?: string | null
          highlight_color?: string
          id?: string
          note?: string | null
          page_number?: number
          position_data?: Json | null
          selected_text?: string
          updated_at?: string
          user_id?: string
          voice_note_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "annotations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_club_books: {
        Row: {
          book_author: string | null
          book_cover_url: string | null
          book_title: string
          club_id: string | null
          created_at: string | null
          end_date: string | null
          id: string
          is_current: boolean | null
          start_date: string | null
        }
        Insert: {
          book_author?: string | null
          book_cover_url?: string | null
          book_title: string
          club_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean | null
          start_date?: string | null
        }
        Update: {
          book_author?: string | null
          book_cover_url?: string | null
          book_title?: string
          club_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_club_books_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "book_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      book_club_discussions: {
        Row: {
          club_book_id: string | null
          club_id: string | null
          content: string
          created_at: string | null
          id: string
          page_reference: number | null
          parent_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          club_book_id?: string | null
          club_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          page_reference?: number | null
          parent_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          club_book_id?: string | null
          club_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          page_reference?: number | null
          parent_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_club_discussions_club_book_id_fkey"
            columns: ["club_book_id"]
            isOneToOne: false
            referencedRelation: "book_club_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_club_discussions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "book_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_club_discussions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "book_club_discussions"
            referencedColumns: ["id"]
          },
        ]
      }
      book_club_members: {
        Row: {
          club_id: string | null
          id: string
          joined_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          club_id?: string | null
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          club_id?: string | null
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "book_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      book_clubs: {
        Row: {
          cover_url: string | null
          created_at: string | null
          description: string | null
          id: string
          invite_code: string | null
          is_public: boolean | null
          max_members: number | null
          name: string
          owner_id: string
          updated_at: string | null
        }
        Insert: {
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          invite_code?: string | null
          is_public?: boolean | null
          max_members?: number | null
          name: string
          owner_id: string
          updated_at?: string | null
        }
        Update: {
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          invite_code?: string | null
          is_public?: boolean | null
          max_members?: number | null
          name?: string
          owner_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      book_recommendations: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          id: string
          is_dismissed: boolean | null
          reason: string | null
          recommended_author: string | null
          recommended_cover_url: string | null
          recommended_title: string
          source_type: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          reason?: string | null
          recommended_author?: string | null
          recommended_cover_url?: string | null
          recommended_title: string
          source_type?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          reason?: string | null
          recommended_author?: string | null
          recommended_cover_url?: string | null
          recommended_title?: string
          source_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      book_reviews: {
        Row: {
          book_id: string
          created_at: string | null
          id: string
          is_public: boolean | null
          rating: number | null
          review: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          rating?: number | null
          review?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          rating?: number | null
          review?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_reviews_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_tags: {
        Row: {
          book_id: string
          created_at: string | null
          id: string
          tag_id: string
        }
        Insert: {
          book_id: string
          created_at?: string | null
          id?: string
          tag_id: string
        }
        Update: {
          book_id?: string
          created_at?: string | null
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_tags_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author: string | null
          cover_url: string | null
          created_at: string
          file_size: number | null
          file_type: string
          file_url: string
          finished_reading_at: string | null
          id: string
          is_completed: boolean | null
          is_public: boolean | null
          last_page_read: number | null
          reading_mode: string | null
          reading_progress: number | null
          series: string | null
          started_reading_at: string | null
          title: string
          total_pages: number | null
          tts_position: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          author?: string | null
          cover_url?: string | null
          created_at?: string
          file_size?: number | null
          file_type: string
          file_url: string
          finished_reading_at?: string | null
          id?: string
          is_completed?: boolean | null
          is_public?: boolean | null
          last_page_read?: number | null
          reading_mode?: string | null
          reading_progress?: number | null
          series?: string | null
          started_reading_at?: string | null
          title: string
          total_pages?: number | null
          tts_position?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          author?: string | null
          cover_url?: string | null
          created_at?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          finished_reading_at?: string | null
          id?: string
          is_completed?: boolean | null
          is_public?: boolean | null
          last_page_read?: number | null
          reading_mode?: string | null
          reading_progress?: number | null
          series?: string | null
          started_reading_at?: string | null
          title?: string
          total_pages?: number | null
          tts_position?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          is_premium_override: boolean | null
          notification_preferences: Json | null
          push_subscription: Json | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          is_premium_override?: boolean | null
          notification_preferences?: Json | null
          push_subscription?: Json | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_premium_override?: boolean | null
          notification_preferences?: Json | null
          push_subscription?: Json | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      reading_challenges: {
        Row: {
          created_at: string | null
          current_value: number | null
          end_date: string
          goal_type: string
          goal_value: number
          id: string
          is_active: boolean | null
          is_completed: boolean | null
          name: string
          start_date: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_value?: number | null
          end_date: string
          goal_type: string
          goal_value: number
          id?: string
          is_active?: boolean | null
          is_completed?: boolean | null
          name: string
          start_date: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_value?: number | null
          end_date?: string
          goal_type?: string
          goal_value?: number
          id?: string
          is_active?: boolean | null
          is_completed?: boolean | null
          name?: string
          start_date?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reading_list_books: {
        Row: {
          added_at: string | null
          book_id: string
          id: string
          list_id: string
          position: number | null
        }
        Insert: {
          added_at?: string | null
          book_id: string
          id?: string
          list_id: string
          position?: number | null
        }
        Update: {
          added_at?: string | null
          book_id?: string
          id?: string
          list_id?: string
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reading_list_books_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_list_books_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "reading_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_lists: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          position: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          position?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          position?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reading_reminders: {
        Row: {
          created_at: string | null
          days_of_week: number[] | null
          id: string
          is_enabled: boolean | null
          reminder_type: string
          time_of_day: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          days_of_week?: number[] | null
          id?: string
          is_enabled?: boolean | null
          reminder_type: string
          time_of_day: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          days_of_week?: number[] | null
          id?: string
          is_enabled?: boolean | null
          reminder_type?: string
          time_of_day?: string
          user_id?: string
        }
        Relationships: []
      }
      reading_sessions: {
        Row: {
          book_id: string
          created_at: string
          duration_minutes: number | null
          end_time: string | null
          id: string
          pages_read: number
          start_time: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          pages_read?: number
          start_time?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          pages_read?: number
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_sessions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reading: {
        Row: {
          book_id: string | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          is_completed: boolean | null
          scheduled_date: string
          scheduled_time: string | null
          user_id: string
        }
        Insert: {
          book_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_completed?: boolean | null
          scheduled_date: string
          scheduled_time?: string | null
          user_id: string
        }
        Update: {
          book_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_completed?: boolean | null
          scheduled_date?: string
          scheduled_time?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_reading_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string | null
          earned_at: string | null
          id: string
          notified: boolean | null
          user_id: string
        }
        Insert: {
          achievement_id?: string | null
          earned_at?: string | null
          id?: string
          notified?: boolean | null
          user_id: string
        }
        Update: {
          achievement_id?: string | null
          earned_at?: string | null
          id?: string
          notified?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reading_preferences: {
        Row: {
          favorite_authors: string[] | null
          favorite_genres: string[] | null
          prefers_series: boolean | null
          reading_pace: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          favorite_authors?: string[] | null
          favorite_genres?: string[] | null
          prefers_series?: boolean | null
          reading_pace?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          favorite_authors?: string[] | null
          favorite_genres?: string[] | null
          prefers_series?: boolean | null
          reading_pace?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vocabulary: {
        Row: {
          book_id: string | null
          context: string | null
          created_at: string | null
          definition: string | null
          id: string
          mastery_level: number | null
          next_review_at: string | null
          page_number: number | null
          updated_at: string | null
          user_id: string
          word: string
        }
        Insert: {
          book_id?: string | null
          context?: string | null
          created_at?: string | null
          definition?: string | null
          id?: string
          mastery_level?: number | null
          next_review_at?: string | null
          page_number?: number | null
          updated_at?: string | null
          user_id: string
          word: string
        }
        Update: {
          book_id?: string | null
          context?: string | null
          created_at?: string | null
          definition?: string | null
          id?: string
          mastery_level?: number | null
          next_review_at?: string | null
          page_number?: number | null
          updated_at?: string | null
          user_id?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocabulary_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_club_member: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
