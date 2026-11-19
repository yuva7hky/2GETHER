-- ==============================================================================
-- 2GETHER: Row Level Security (RLS) Policies (Phase 1)
-- "Two Hearts. One Theatre. One Movie."
-- Target: Supabase / PostgreSQL 15+
-- ==============================================================================

-- Enable RLS on all project tables
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Helper function: Is the current user an authorized participant of this room?
CREATE OR REPLACE FUNCTION public.is_room_participant(target_room_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.room_participants
        WHERE room_id = target_room_id
          AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Is the current user the host of this room?
CREATE OR REPLACE FUNCTION public.is_room_host(target_room_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.rooms
        WHERE id = target_room_id
          AND host_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 1. ROOMS POLICIES
-- ------------------------------------------------------------------------------
-- Anyone authenticated can create a new room
CREATE POLICY "Authenticated users can create rooms"
ON public.rooms FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = host_id);

-- Only host and authorized guest can view the room details
CREATE POLICY "Participants can view their room"
ON public.rooms FOR SELECT
TO authenticated
USING (auth.uid() = host_id OR auth.uid() = guest_id);

-- Only host can update room state or attach movie
CREATE POLICY "Host can update room"
ON public.rooms FOR UPDATE
TO authenticated
USING (auth.uid() = host_id)
WITH CHECK (auth.uid() = host_id);

-- ------------------------------------------------------------------------------
-- 2. ROOM PARTICIPANTS POLICIES
-- ------------------------------------------------------------------------------
-- Participants can view members in their room
CREATE POLICY "Participants can view room members"
ON public.room_participants FOR SELECT
TO authenticated
USING (public.is_room_participant(room_id));

-- Users can join a room as themselves
CREATE POLICY "Users can join as participant"
ON public.room_participants FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Participants can update their own presence/status
CREATE POLICY "Participants can update own presence"
ON public.room_participants FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 3. MOVIES POLICIES
-- ------------------------------------------------------------------------------
-- Only room host/creator can upload/insert movie record
CREATE POLICY "Host can insert movie record"
ON public.movies FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = uploader_id 
    AND public.is_room_host(room_id)
);

-- Both room participants can view movie metadata for synchronized playback
CREATE POLICY "Participants can view room movie"
ON public.movies FOR SELECT
TO authenticated
USING (public.is_room_participant(room_id));

-- Host can delete movie
CREATE POLICY "Host can delete movie"
ON public.movies FOR DELETE
TO authenticated
USING (auth.uid() = uploader_id);

-- ------------------------------------------------------------------------------
-- 4. CHAT MESSAGES POLICIES
-- ------------------------------------------------------------------------------
-- Participants can view messages in their room
CREATE POLICY "Participants can read chat messages"
ON public.chat_messages FOR SELECT
TO authenticated
USING (public.is_room_participant(room_id));

-- Participants can insert messages into their room
CREATE POLICY "Participants can post chat messages"
ON public.chat_messages FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = sender_id 
    AND public.is_room_participant(room_id)
);

