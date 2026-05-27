// Run this to regenerate from your live Supabase project:
// npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.ts

export type Gender = 'male' | 'female' | 'other'
export type ListingStatus = 'open' | 'closed' | 'full' | 'expired'
export type ResponseMode = 'no_responses' | 'sign_up' | 'apply'
export type MemberRole = 'admin' | 'member'
export type ApplicantStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'blocked'
export type ConversationType = '1on1' | 'group'

// ── Row shapes (what you get back from SELECT) ──────────────────
export type Profile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  gender: Gender | null
  birth_year: number | null
  bio: string | null
  location_lat: number | null
  location_lng: number | null
  location_label: string | null
  travel_radius_km: number | null
  interests_raw: string | null
  interest_tags: string[]
  facebook_url: string | null
  social_links_other: string | null
  created_at: string
  updated_at: string
}

export type ProfileChild = {
  id: string
  profile_id: string
  gender: Gender | null
  birth_year: number
  created_at: string
}

export type Listing = {
  id: string
  creator_id: string
  title: string
  description: string | null
  location_lat: number
  location_lng: number
  location_label: string | null
  radius_km: number | null
  max_members: number | null
  expires_at: string | null
  status: ListingStatus
  response_mode: ResponseMode
  criteria: string[]
  is_public: boolean
  interest_tags: string[]
  created_at: string
  updated_at: string
}

export type ListingMember = {
  id: string
  listing_id: string
  profile_id: string
  role: MemberRole
  joined_at: string
}

export type ListingApplicant = {
  id: string
  listing_id: string
  profile_id: string
  status: ApplicantStatus
  pitch: string | null
  applied_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

export type Conversation = {
  id: string
  listing_id: string | null
  type: ConversationType
  created_at: string
}

export type ConversationParticipant = {
  id: string
  conversation_id: string
  profile_id: string
  joined_at: string
}

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  body: string | null
  image_url: string | null
  created_at: string
}

export type DiscoveredListing = Listing & {
  distance_km: number
  tag_overlap: number
  member_count: number
}

// ── Supabase Database generic (used by createBrowserClient<Database>) ──
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>
      }
      profile_children: {
        Row: ProfileChild
        Insert: Omit<ProfileChild, 'id' | 'created_at'>
        Update: Partial<Omit<ProfileChild, 'id' | 'created_at'>>
      }
      listings: {
        Row: Listing
        Insert: Omit<Listing, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Listing, 'id' | 'created_at' | 'updated_at'>>
      }
      listing_members: {
        Row: ListingMember
        Insert: Omit<ListingMember, 'id' | 'joined_at'>
        Update: Partial<Omit<ListingMember, 'id' | 'joined_at'>>
      }
      listing_applicants: {
        Row: ListingApplicant
        Insert: Omit<ListingApplicant, 'id' | 'applied_at'>
        Update: Partial<Omit<ListingApplicant, 'id' | 'applied_at'>>
      }
      conversations: {
        Row: Conversation
        Insert: Omit<Conversation, 'id' | 'created_at'>
        Update: Partial<Omit<Conversation, 'id' | 'created_at'>>
      }
      conversation_participants: {
        Row: ConversationParticipant
        Insert: Omit<ConversationParticipant, 'id' | 'joined_at'>
        Update: Partial<Omit<ConversationParticipant, 'id' | 'joined_at'>>
      }
      messages: {
        Row: Message
        Insert: Omit<Message, 'id' | 'created_at'>
        Update: Partial<Omit<Message, 'id' | 'created_at'>>
      }
    }
    Views: Record<string, never>
    Functions: {
      discover_listings: {
        Args: {
          p_lat: number
          p_lng: number
          p_radius_km?: number
          p_tags?: string[]
          p_limit?: number
          p_offset?: number
        }
        Returns: DiscoveredListing[]
      }
      apply_to_listing: {
        Args: { p_listing_id: string; p_pitch?: string }
        Returns: string
      }
      sign_up_to_listing: {
        Args: { p_listing_id: string }
        Returns: void
      }
      review_applicant: {
        Args: { p_applicant_id: string; p_decision: ApplicantStatus }
        Returns: undefined
      }
      get_or_create_applicant_conversation: {
        Args: { p_listing_id: string; p_admin_id: string }
        Returns: string
      }
    }
    Enums: {
      gender_type: Gender
      listing_status: ListingStatus
      response_mode: ResponseMode
      member_role: MemberRole
      applicant_status: ApplicantStatus
      conversation_type: ConversationType
    }
  }
}
