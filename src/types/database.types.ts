export type ChallengeStatus =
  | "proposed"
  | "negotiating"
  | "accepted"
  | "in_progress"
  | "proof_submitted"
  | "validated"
  | "rejected"
  | "expired"
  | "cancelled";

export type TransactionType =
  | "challenge_reward"
  | "challenge_penalty"
  | "shop_purchase"
  | "bonus"
  | "refund";

export type ItemType = "custom" | "joker" | "booster" | "voleur";

export type MemberRole = "owner" | "admin" | "member";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          avatar_url: string | null;
          total_points: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          avatar_url?: string | null;
          total_points?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          avatar_url?: string | null;
          total_points?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          invite_code: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          invite_code?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          invite_code?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      members: {
        Row: {
          group_id: string;
          profile_id: string;
          role: MemberRole;
          joined_at: string;
        };
        Insert: {
          group_id: string;
          profile_id: string;
          role?: MemberRole;
          joined_at?: string;
        };
        Update: {
          group_id?: string;
          profile_id?: string;
          role?: MemberRole;
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      challenges: {
        Row: {
          id: string;
          group_id: string;
          creator_id: string;
          target_id: string;
          title: string;
          description: string | null;
          points: number;
          status: ChallengeStatus;
          deadline: string | null;
          booster_inventory_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          creator_id: string;
          target_id: string;
          title: string;
          description?: string | null;
          points: number;
          status?: ChallengeStatus;
          deadline?: string | null;
          booster_inventory_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          creator_id?: string;
          target_id?: string;
          title?: string;
          description?: string | null;
          points?: number;
          status?: ChallengeStatus;
          deadline?: string | null;
          booster_inventory_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "challenges_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "challenges_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "challenges_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      proofs: {
        Row: {
          id: string;
          challenge_id: string;
          submitted_by: string;
          media_url: string | null;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          challenge_id: string;
          submitted_by: string;
          media_url?: string | null;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          challenge_id?: string;
          submitted_by?: string;
          media_url?: string | null;
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "proofs_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: false;
            referencedRelation: "challenges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proofs_submitted_by_fkey";
            columns: ["submitted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          profile_id: string;
          amount: number;
          type: TransactionType;
          challenge_id: string | null;
          shop_item_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          amount: number;
          type: TransactionType;
          challenge_id?: string | null;
          shop_item_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          amount?: number;
          type?: TransactionType;
          challenge_id?: string | null;
          shop_item_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: false;
            referencedRelation: "challenges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_transactions_shop_item";
            columns: ["shop_item_id"];
            isOneToOne: false;
            referencedRelation: "shop_items";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_items: {
        Row: {
          id: string;
          group_id: string;
          name: string;
          description: string | null;
          price: number;
          stock: number | null;
          item_type: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          name: string;
          description?: string | null;
          price: number;
          stock?: number | null;
          item_type?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          name?: string;
          description?: string | null;
          price?: number;
          stock?: number | null;
          item_type?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_items_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory: {
        Row: {
          id: string;
          profile_id: string;
          shop_item_id: string;
          purchased_at: string;
          used_at: string | null;
          used_on_challenge_id: string | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          shop_item_id: string;
          purchased_at?: string;
          used_at?: string | null;
          used_on_challenge_id?: string | null;
        };
        Update: {
          id?: string;
          profile_id?: string;
          shop_item_id?: string;
          purchased_at?: string;
          used_at?: string | null;
          used_on_challenge_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_shop_item_id_fkey";
            columns: ["shop_item_id"];
            isOneToOne: false;
            referencedRelation: "shop_items";
            referencedColumns: ["id"];
          },
        ];
      };
      badges: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string;
          icon: string;
          condition_type: string;
          condition_value: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description: string;
          icon?: string;
          condition_type: string;
          condition_value?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string;
          icon?: string;
          condition_type?: string;
          condition_value?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      user_badges: {
        Row: {
          id: string;
          profile_id: string;
          badge_id: string;
          earned_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          badge_id: string;
          earned_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          badge_id?: string;
          earned_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_badges_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_badges_badge_id_fkey";
            columns: ["badge_id"];
            isOneToOne: false;
            referencedRelation: "badges";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          id: string;
          profile_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          profile_id: string;
          type: string;
          title: string;
          body: string;
          metadata: Record<string, unknown>;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          type: string;
          title: string;
          body?: string;
          metadata?: Record<string, unknown>;
          read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          type?: string;
          title?: string;
          body?: string;
          metadata?: Record<string, unknown>;
          read?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_group_member: {
        Args: { group_uuid: string };
        Returns: boolean;
      };
      is_group_admin: {
        Args: { group_uuid: string };
        Returns: boolean;
      };
      purchase_item: {
        Args: { p_item_id: string };
        Returns: undefined;
      };
      join_group_by_invite_code: {
        Args: { code: string };
        Returns: string;
      };
      validate_challenge: {
        Args: { p_challenge_id: string };
        Returns: undefined;
      };
      check_and_award_badges: {
        Args: { p_profile_id: string };
        Returns: number;
      };
      create_notification: {
        Args: {
          p_profile_id: string;
          p_type: string;
          p_title: string;
          p_body?: string;
          p_metadata?: Record<string, unknown>;
        };
        Returns: undefined;
      };
      get_push_subscriptions: {
        Args: { p_profile_id: string };
        Returns: { endpoint: string; p256dh: string; auth: string }[];
      };
      decline_with_penalty: {
        Args: {
          p_challenge_id: string;
          p_joker_inventory_id?: string;
        };
        Returns: {
          penalty: number;
          joker_used: boolean;
          free_declines_remaining: number;
        };
      };
      use_voleur: {
        Args: { p_inventory_id: string };
        Returns: {
          stolen: number;
          victim_id: string;
          victim_username: string;
        };
      };
    };
    Enums: {
      challenge_status: ChallengeStatus;
      transaction_type: TransactionType;
      member_role: MemberRole;
    };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
