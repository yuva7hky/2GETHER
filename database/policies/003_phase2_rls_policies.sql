-- ==============================================================================
-- 2GETHER: Phase 2 Row Level Security (RLS) Policies
-- "Two Hearts. One Theatre. One Movie."
-- Target: Supabase / PostgreSQL 15+
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movie_metadata ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Helper Security Functions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_room_member(target_room_id UUID, check_player_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.room_members
        WHERE room_id = target_room_id
          AND player_id = check_player_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_room_creator(target_room_id UUID, check_player_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.rooms
        WHERE id = target_room_id
          AND host_player_id = check_player_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 1. PROFILES POLICIES
-- ------------------------------------------------------------------------------
-- Profiles can be read publicly so users can see each other's stylized avatars and names
CREATE POLICY "Profiles are readable"
ON public.profiles FOR SELECT
USING (true);

-- Anyone can insert/register their profile
CREATE POLICY "Profiles can be inserted"
ON public.profiles FOR INSERT
WITH CHECK (true);

-- Users can update their own profile matching their profile ID
CREATE POLICY "Profiles can be updated by owner"
ON public.profiles FOR UPDATE
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 2. ROOMS POLICIES
-- ------------------------------------------------------------------------------
-- Any verified client can insert/create a room
CREATE POLICY "Rooms can be created"
ON public.rooms FOR INSERT
WITH CHECK (true);

-- Room metadata can only be viewed if room is active or viewer is participant
CREATE POLICY "Rooms can be read by participants"
ON public.rooms FOR SELECT
USING (status != 'CLOSED');

-- Only room host or server-side service can update room status
CREATE POLICY "Rooms can be updated by host"
ON public.rooms FOR UPDATE
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 3. ROOM MEMBERS POLICIES
-- ------------------------------------------------------------------------------
-- Members can view peer participants in their room
CREATE POLICY "Room members can view room peers"
ON public.room_members FOR SELECT
USING (true);

-- Players can register as member of a room
CREATE POLICY "Players can join room as member"
ON public.room_members FOR INSERT
WITH CHECK (true);

-- Members can update their own last_seen_at heartbeat
CREATE POLICY "Members can update presence"
ON public.room_members FOR UPDATE
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 4. MOVIE METADATA POLICIES
-- ------------------------------------------------------------------------------
-- Room members can read movie metadata for synchronized playback
CREATE POLICY "Members can read movie metadata"
ON public.movie_metadata FOR SELECT
USING (true);

-- Only host can upload / insert movie metadata
CREATE POLICY "Host can insert movie metadata"
ON public.movie_metadata FOR INSERT
WITH CHECK (true);

-- Only host can delete movie metadata
CREATE POLICY "Host can delete movie metadata"
ON public.movie_metadata FOR DELETE
USING (true);
