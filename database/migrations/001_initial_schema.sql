-- ==============================================================================
-- 2GETHER: Master Database Schema (Phase 1)
-- "Two Hearts. One Theatre. One Movie."
-- Target: Supabase / PostgreSQL 15+
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. ROOMS TABLE
-- Tracks virtual theatre rooms with strict 2-player capacity
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(8) UNIQUE NOT NULL,
    host_id UUID NOT NULL,
    guest_id UUID,
    state VARCHAR(20) NOT NULL DEFAULT 'WAITING' 
        CHECK (state IN ('WAITING', 'READY', 'IN_THEATRE', 'WATCHING', 'CLOSED')),
    current_movie_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for fast lookup by code and activity
CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_last_active ON public.rooms(last_active_at);

-- ------------------------------------------------------------------------------
-- 2. ROOM PARTICIPANTS TABLE
-- Represents the two active players in a room
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    character_name VARCHAR(50) NOT NULL,
    character_data JSONB NOT NULL DEFAULT '{
        "colorScheme": "sunset_pink",
        "clothingColor": "#ec4899",
        "hairColor": "#3b0764",
        "skinColor": "#fbcfe8",
        "accessory": "ribbon"
    }'::jsonb,
    is_host BOOLEAN NOT NULL DEFAULT false,
    connected BOOLEAN NOT NULL DEFAULT true,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_room_user UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_room_id ON public.room_participants(room_id);

-- ------------------------------------------------------------------------------
-- 3. MOVIES TABLE
-- Metadata for temporarily uploaded videos in Cloudflare R2
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.movies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    r2_key VARCHAR(512) NOT NULL,
    file_size BIGINT NOT NULL CHECK (file_size > 0 AND file_size <= 734003200), -- Max 700MB (700 * 1024 * 1024 bytes)
    mime_type VARCHAR(100) NOT NULL DEFAULT 'video/mp4',
    duration_seconds NUMERIC(10, 2) DEFAULT 0.0,
    status VARCHAR(20) NOT NULL DEFAULT 'READY' 
        CHECK (status IN ('UPLOADING', 'READY', 'PLAYING', 'ERROR', 'DELETED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '4 hours')
);

CREATE INDEX IF NOT EXISTS idx_movies_room_id ON public.movies(room_id);

-- ------------------------------------------------------------------------------
-- 4. CHAT MESSAGES TABLE
-- Encrypted / scoped real-time chat between the two room members
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL,
    sender_name VARCHAR(50) NOT NULL,
    message TEXT NOT NULL CHECK (char_length(trim(message)) > 0 AND char_length(message) <= 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created ON public.chat_messages(room_id, created_at ASC);

-- ------------------------------------------------------------------------------
-- 5. ROOM CAPACITY INTEGRITY TRIGGER
-- Hard limit on the database level: A room must NEVER exceed 2 participants
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_room_capacity()
RETURNS TRIGGER AS $$
DECLARE
    participant_count INT;
BEGIN
    SELECT COUNT(*) INTO participant_count
    FROM public.room_participants
    WHERE room_id = NEW.room_id;

    IF participant_count >= 2 THEN
        RAISE EXCEPTION 'Room % already has the maximum allowed participants (STRICTLY 2).', NEW.room_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_room_capacity ON public.room_participants;
CREATE TRIGGER trigger_enforce_room_capacity
BEFORE INSERT ON public.room_participants
FOR EACH ROW
EXECUTE FUNCTION public.check_room_capacity();

-- ------------------------------------------------------------------------------
-- 6. AUTOMATIC TIMESTAMP UPDATE TRIGGER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_rooms_updated_at ON public.rooms;
CREATE TRIGGER trigger_rooms_updated_at
BEFORE UPDATE ON public.rooms
FOR EACH ROW
EXECUTE FUNCTION public.update_timestamp();
