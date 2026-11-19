-- ==============================================================================
-- 2GETHER: Phase 2 Supabase PostgreSQL Schema Migration
-- "Two Hearts. One Theatre. One Movie."
-- Target: Supabase / PostgreSQL 15+
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. PROFILES TABLE
-- Stores user identity, custom display name, and 3D avatar configuration
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    avatar_config JSONB NOT NULL DEFAULT '{
        "colorScheme": "sunset_pink",
        "clothingColor": "#ec4899",
        "hairColor": "#3b0764",
        "skinColor": "#fbcfe8",
        "accessory": "ribbon",
        "eyeStyle": "sparkle"
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON public.profiles(updated_at);

-- ------------------------------------------------------------------------------
-- 2. ROOMS TABLE
-- Persistent record of virtual theatre rooms with strict 2-player capacity
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(8) UNIQUE NOT NULL,
    host_player_id TEXT NOT NULL,
    guest_player_id TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'WAITING'
        CHECK (status IN ('WAITING', 'READY', 'IN_THEATRE', 'WATCHING', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '4 hours')
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_last_activity ON public.rooms(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_rooms_expires_at ON public.rooms(expires_at);

-- ------------------------------------------------------------------------------
-- 3. ROOM MEMBERS TABLE
-- Represents the two active players in a room (host and guest)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    role VARCHAR(10) NOT NULL CHECK (role IN ('host', 'guest')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_room_player UNIQUE(room_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON public.room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_player_id ON public.room_members(player_id);

-- ------------------------------------------------------------------------------
-- 4. MOVIE METADATA TABLE
-- Metadata for video files associated with a theatre room
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.movie_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    uploaded_by TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size BIGINT NOT NULL CHECK (file_size > 0 AND file_size <= 734003200), -- Max 700MB
    content_type TEXT NOT NULL DEFAULT 'video/mp4',
    r2_object_key TEXT NOT NULL,
    upload_status VARCHAR(20) NOT NULL DEFAULT 'READY'
        CHECK (upload_status IN ('UPLOADING', 'READY', 'PLAYING', 'ERROR', 'DELETED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '4 hours')
);

CREATE INDEX IF NOT EXISTS idx_movie_metadata_room_id ON public.movie_metadata(room_id);

-- ------------------------------------------------------------------------------
-- 5. ROOM CAPACITY INTEGRITY TRIGGER (STRICTLY 2 PARTICIPANTS)
-- Enforces hard maximum limit of 2 players per room on database layer
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_room_capacity()
RETURNS TRIGGER AS $$
DECLARE
    member_count INT;
BEGIN
    SELECT COUNT(*) INTO member_count
    FROM public.room_members
    WHERE room_id = NEW.room_id;

    IF member_count >= 2 THEN
        RAISE EXCEPTION 'Room % already has the maximum allowed participants (STRICTLY 2).', NEW.room_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_room_capacity ON public.room_members;
CREATE TRIGGER trigger_enforce_room_capacity
BEFORE INSERT ON public.room_members
FOR EACH ROW
EXECUTE FUNCTION public.check_room_capacity();

-- ------------------------------------------------------------------------------
-- 6. AUTOMATIC TIMESTAMP UPDATE TRIGGER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'profiles' THEN
        NEW.updated_at = timezone('utc'::text, now());
    ELSIF TG_TABLE_NAME = 'rooms' THEN
        NEW.last_activity_at = timezone('utc'::text, now());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS trigger_rooms_last_activity ON public.rooms;
CREATE TRIGGER trigger_rooms_last_activity
BEFORE UPDATE ON public.rooms
FOR EACH ROW
EXECUTE FUNCTION public.update_timestamp();
