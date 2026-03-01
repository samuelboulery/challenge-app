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
  | "refund"
  | "season_reset";

export type ItemType =
  | "custom"
  | "joker"
  | "booster"
  | "voleur"
  | "item_49_3"
  | "gilet_pare_balles"
  | "mode_fantome"
  | "miroir_magique"
  | "patate_chaude"
  | "cinquante_cinquante"
  | "menottes"
  | "surcharge"
  | "sniper"
  | "embargo"
  | "roulette_russe"
  | "robin_des_bois"
  | "amnesie"
  | "mouchard"
  | "assurance"
  | "quitte_ou_double";

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
      group_seasons: {
        Row: {
          id: string;
          group_id: string;
          season_key: string;
          starts_at: string;
          ends_at: string;
          status: string;
          winner_profile_id: string | null;
          winner_points: number;
          crown_holder_profile_id: string | null;
          finalized_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          season_key: string;
          starts_at: string;
          ends_at: string;
          status?: string;
          winner_profile_id?: string | null;
          winner_points?: number;
          crown_holder_profile_id?: string | null;
          finalized_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          season_key?: string;
          starts_at?: string;
          ends_at?: string;
          status?: string;
          winner_profile_id?: string | null;
          winner_points?: number;
          crown_holder_profile_id?: string | null;
          finalized_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_seasons_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_seasons_winner_profile_id_fkey";
            columns: ["winner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_seasons_crown_holder_profile_id_fkey";
            columns: ["crown_holder_profile_id"];
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
          no_negotiation: boolean;
          insurance_enabled: boolean;
          double_or_nothing_requested: boolean;
          double_or_nothing_approved: boolean;
          challenge_bundle_id: string | null;
          bundle_choice_required: boolean;
          contested_once: boolean;
          proof_rejections_count: number;
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
          no_negotiation?: boolean;
          insurance_enabled?: boolean;
          double_or_nothing_requested?: boolean;
          double_or_nothing_approved?: boolean;
          challenge_bundle_id?: string | null;
          bundle_choice_required?: boolean;
          contested_once?: boolean;
          proof_rejections_count?: number;
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
          no_negotiation?: boolean;
          insurance_enabled?: boolean;
          double_or_nothing_requested?: boolean;
          double_or_nothing_approved?: boolean;
          challenge_bundle_id?: string | null;
          bundle_choice_required?: boolean;
          contested_once?: boolean;
          proof_rejections_count?: number;
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
          global_shop_item_id: string | null;
          group_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          amount: number;
          type: TransactionType;
          challenge_id?: string | null;
          shop_item_id?: string | null;
          global_shop_item_id?: string | null;
          group_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          amount?: number;
          type?: TransactionType;
          challenge_id?: string | null;
          shop_item_id?: string | null;
          global_shop_item_id?: string | null;
          group_id?: string | null;
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
          {
            foreignKeyName: "transactions_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
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
          shop_item_id: string | null;
          global_shop_item_id: string | null;
          purchased_group_id: string | null;
          purchased_at: string;
          used_at: string | null;
          used_on_challenge_id: string | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          shop_item_id?: string | null;
          global_shop_item_id?: string | null;
          purchased_group_id?: string | null;
          purchased_at?: string;
          used_at?: string | null;
          used_on_challenge_id?: string | null;
        };
        Update: {
          id?: string;
          profile_id?: string;
          shop_item_id?: string | null;
          global_shop_item_id?: string | null;
          purchased_group_id?: string | null;
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
          {
            foreignKeyName: "inventory_global_shop_item_id_fkey";
            columns: ["global_shop_item_id"];
            isOneToOne: false;
            referencedRelation: "global_shop_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_purchased_group_id_fkey";
            columns: ["purchased_group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      global_shop_items: {
        Row: {
          id: string;
          item_type: string;
          name: string;
          description: string | null;
          price: number;
          stock: number | null;
          is_active_global: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          item_type: string;
          name: string;
          description?: string | null;
          price: number;
          stock?: number | null;
          is_active_global?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          item_type?: string;
          name?: string;
          description?: string | null;
          price?: number;
          stock?: number | null;
          is_active_global?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      group_enabled_items: {
        Row: {
          group_id: string;
          global_item_id: string;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          group_id: string;
          global_item_id: string;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          group_id?: string;
          global_item_id?: string;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_enabled_items_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_enabled_items_global_item_id_fkey";
            columns: ["global_item_id"];
            isOneToOne: false;
            referencedRelation: "global_shop_items";
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
      challenge_votes: {
        Row: {
          id: string;
          challenge_id: string;
          voter_id: string;
          vote: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          challenge_id: string;
          voter_id: string;
          vote: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          challenge_id?: string;
          voter_id?: string;
          vote?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "challenge_votes_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: false;
            referencedRelation: "challenges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "challenge_votes_voter_id_fkey";
            columns: ["voter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_effects: {
        Row: {
          id: string;
          group_id: string;
          source_profile_id: string;
          target_profile_id: string;
          effect_type: string;
          active_until: string;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          source_profile_id: string;
          target_profile_id: string;
          effect_type: string;
          active_until: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          source_profile_id?: string;
          target_profile_id?: string;
          effect_type?: string;
          active_until?: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_effects_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_effects_source_profile_id_fkey";
            columns: ["source_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_effects_target_profile_id_fkey";
            columns: ["target_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      quit_or_double_votes: {
        Row: {
          challenge_id: string;
          voter_id: string;
          approve: boolean;
          created_at: string;
        };
        Insert: {
          challenge_id: string;
          voter_id: string;
          approve?: boolean;
          created_at?: string;
        };
        Update: {
          challenge_id?: string;
          voter_id?: string;
          approve?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quit_or_double_votes_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: false;
            referencedRelation: "challenges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quit_or_double_votes_voter_id_fkey";
            columns: ["voter_id"];
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
        Args: { p_item_id: string; p_group_id?: string };
        Returns: undefined;
      };
      get_my_group_shop_effective_prices: {
        Args: { p_group_id: string };
        Returns: {
          item_id: string;
          effective_price: number;
        }[];
      };
      join_group_by_invite_code: {
        Args: { code: string };
        Returns: string;
      };
      create_group: {
        Args: {
          p_name: string;
          p_description?: string | null;
        };
        Returns: string;
      };
      delete_group_admin: {
        Args: { p_group_id: string };
        Returns: undefined;
      };
      reset_group_data_admin: {
        Args: { p_group_id: string };
        Returns: string[];
      };
      get_group_points_leaderboard: {
        Args: { p_group_id: string };
        Returns: {
          profile_id: string;
          username: string;
          group_points: number;
        }[];
      };
      ensure_group_current_season: {
        Args: { p_group_id: string };
        Returns: {
          season_id: string;
          season_key: string;
          starts_at: string;
          ends_at: string;
          crown_holder_profile_id: string | null;
        }[];
      };
      get_group_season_leaderboard: {
        Args: { p_group_id: string };
        Returns: {
          profile_id: string;
          username: string;
          group_points: number;
        }[];
      };
      get_group_all_time_leaderboard: {
        Args: { p_group_id: string };
        Returns: {
          profile_id: string;
          username: string;
          group_points: number;
        }[];
      };
      get_group_profile_titles: {
        Args: { p_group_id: string };
        Returns: {
          title_key: string;
          title_label: string;
          profile_id: string | null;
          username: string | null;
          metric_value: number;
        }[];
      };
      adjust_member_group_points: {
        Args: {
          p_group_id: string;
          p_member_id: string;
          p_new_points: number;
        };
        Returns: Record<string, unknown>;
      };
      transfer_group_ownership: {
        Args: { p_group_id: string; p_new_owner_id: string };
        Returns: undefined;
      };
      start_challenge_price_negotiation: {
        Args: { p_challenge_id: string };
        Returns: Record<string, unknown>;
      };
      start_challenge_contestation: {
        Args: { p_challenge_id: string };
        Returns: Record<string, unknown>;
      };
      vote_challenge_price: {
        Args: {
          p_challenge_id: string;
          p_vote: string;
          p_counter_points?: number | null;
        };
        Returns: Record<string, unknown>;
      };
      vote_challenge_contestation: {
        Args: {
          p_challenge_id: string;
          p_vote: string;
          p_counter_points?: number | null;
        };
        Returns: Record<string, unknown>;
      };
      cancel_challenge_by_creator: {
        Args: { p_challenge_id: string };
        Returns: Record<string, unknown>;
      };
      creator_decide_counter_proposal: {
        Args: {
          p_challenge_id: string;
          p_action: string;
          p_counter_points?: number | null;
        };
        Returns: Record<string, unknown>;
      };
      get_challenge_price_state: {
        Args: { p_challenge_id: string };
        Returns: Record<string, unknown>;
      };
      vote_on_challenge: {
        Args: { p_challenge_id: string; p_vote: string };
        Returns: Record<string, unknown>;
      };
      abandon_challenge_after_failed_proof: {
        Args: { p_challenge_id: string };
        Returns: Record<string, unknown>;
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
      create_challenges_bulk: {
        Args: {
          p_group_id: string;
          p_target_ids: string[];
          p_title: string;
          p_description?: string | null;
          p_points?: number;
          p_deadline?: string | null;
        };
        Returns: {
          challenge_id: string;
          target_id: string;
        }[];
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
      use_item_49_3_on_challenge: {
        Args: { p_challenge_id: string };
        Returns: {
          status: string;
          reward: number;
          inventory_id: string;
        };
      };
      use_inventory_item_effect: {
        Args: {
          p_inventory_id: string;
          p_challenge_id?: string;
          p_target_profile_id?: string;
          p_payload?: Record<string, unknown>;
        };
        Returns: Record<string, unknown>;
      };
      vote_quitte_ou_double: {
        Args: { p_challenge_id: string; p_approve?: boolean };
        Returns: Record<string, unknown>;
      };
      get_group_hidden_joker_counts: {
        Args: { p_group_id: string };
        Returns: {
          profile_id: string;
          username: string;
          jokers_available: number;
        }[];
      };
      is_profile_effect_active: {
        Args: { p_group_id: string; p_profile_id: string; p_effect_type: string };
        Returns: boolean;
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
