import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

export interface DbProfile {
  id: string;
  display_name: string;
  avatar_config: any;
  created_at: string;
  updated_at: string;
}

export interface DbRoom {
  id: string;
  room_code: string;
  host_player_id: string;
  guest_player_id: string | null;
  status: 'WAITING' | 'READY' | 'IN_THEATRE' | 'WATCHING' | 'CLOSED';
  created_at: string;
  last_activity_at: string;
  expires_at: string;
}

export interface DbRoomMember {
  id: string;
  room_id: string;
  player_id: string;
  role: 'host' | 'guest';
  joined_at: string;
  last_seen_at: string;
}

export interface DbMovieMetadata {
  id: string;
  room_id: string;
  uploaded_by: string;
  original_filename: string;
  file_size: number;
  content_type: string;
  r2_object_key: string;
  upload_status: 'UPLOADING' | 'READY' | 'PLAYING' | 'ERROR' | 'DELETED';
  created_at: string;
  expires_at: string;
}

export class SupabaseService {
  private client: SupabaseClient | null = null;
  private isLive: boolean = false;

  // In-memory simulation store for offline dev/test fallback when Supabase credentials are not configured
  private mockProfiles: Map<string, DbProfile> = new Map();
  private mockRooms: Map<string, DbRoom> = new Map(); // key: room_code
  private mockMembers: Map<string, DbRoomMember[]> = new Map(); // key: room_id
  private mockMovies: Map<string, DbMovieMetadata> = new Map(); // key: room_id

  constructor(customClient?: SupabaseClient) {
    if (customClient) {
      this.client = customClient;
      this.isLive = true;
    } else if (config.hasSupabase && config.SUPABASE_URL && config.SUPABASE_SECRET_KEY) {
      try {
        this.client = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
          auth: { persistSession: false },
        });
        this.isLive = true;
        console.log('[SupabaseService] Initialized with live Supabase credentials.');
      } catch (err) {
        console.warn('[SupabaseService] Failed to initialize live client, using dev fallback:', err);
        this.isLive = false;
      }
    } else {
      console.log('[SupabaseService] No live credentials configured. Running in development persistence mode.');
    }
  }

  public isConnected(): boolean {
    return this.isLive && this.client !== null;
  }

  // ============================================================================
  // PROFILES
  // ============================================================================

  public async getProfile(id: string): Promise<DbProfile | null> {
    if (this.client) {
      const { data, error } = await this.client
        .from('profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('[SupabaseService] getProfile error:', error.message);
        return null;
      }
      return data as DbProfile;
    }

    return this.mockProfiles.get(id) || null;
  }

  public async upsertProfile(profile: {
    id: string;
    display_name: string;
    avatar_config: any;
  }): Promise<DbProfile> {
    const now = new Date().toISOString();

    if (this.client) {
      const { data, error } = await this.client
        .from('profiles')
        .upsert(
          {
            id: profile.id,
            display_name: profile.display_name,
            avatar_config: profile.avatar_config,
            updated_at: now,
          },
          { onConflict: 'id' }
        )
        .select('*')
        .single();

      if (error) {
        console.error('[SupabaseService] upsertProfile error:', error.message);
        throw new Error(`Supabase upsertProfile failed: ${error.message}`);
      }
      return data as DbProfile;
    }

    const existing = this.mockProfiles.get(profile.id);
    const saved: DbProfile = {
      id: profile.id,
      display_name: profile.display_name,
      avatar_config: profile.avatar_config,
      created_at: existing ? existing.created_at : now,
      updated_at: now,
    };
    this.mockProfiles.set(profile.id, saved);
    return saved;
  }

  public async updateProfile(
    id: string,
    updates: Partial<{ display_name: string; avatar_config: any }>
  ): Promise<DbProfile | null> {
    const now = new Date().toISOString();

    if (this.client) {
      const { data, error } = await this.client
        .from('profiles')
        .update({
          ...updates,
          updated_at: now,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('[SupabaseService] updateProfile error:', error.message);
        return null;
      }
      return data as DbProfile;
    }

    const existing = this.mockProfiles.get(id);
    if (!existing) return null;

    const updated: DbProfile = {
      ...existing,
      ...updates,
      updated_at: now,
    };
    this.mockProfiles.set(id, updated);
    return updated;
  }

  // ============================================================================
  // ROOMS
  // ============================================================================

  public async createRoom(data: {
    room_code: string;
    host_player_id: string;
    status?: 'WAITING' | 'READY' | 'IN_THEATRE' | 'WATCHING' | 'CLOSED';
  }): Promise<DbRoom> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    if (this.client) {
      const { data: created, error } = await this.client
        .from('rooms')
        .insert({
          room_code: data.room_code.toUpperCase(),
          host_player_id: data.host_player_id,
          status: data.status || 'WAITING',
          created_at: nowIso,
          last_activity_at: nowIso,
          expires_at: expiresAt,
        })
        .select('*')
        .single();

      if (error) {
        console.error('[SupabaseService] createRoom error:', error.message);
        throw new Error(`Supabase createRoom failed: ${error.message}`);
      }

      // Add Host as initial member
      await this.addMember(created.id, data.host_player_id, 'host');
      return created as DbRoom;
    }

    const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const mockRoom: DbRoom = {
      id: roomId,
      room_code: data.room_code.toUpperCase(),
      host_player_id: data.host_player_id,
      guest_player_id: null,
      status: data.status || 'WAITING',
      created_at: nowIso,
      last_activity_at: nowIso,
      expires_at: expiresAt,
    };

    this.mockRooms.set(mockRoom.room_code, mockRoom);
    await this.addMember(roomId, data.host_player_id, 'host');
    return mockRoom;
  }

  public async getRoomByCode(roomCode: string): Promise<DbRoom | null> {
    const code = roomCode.trim().toUpperCase();

    if (this.client) {
      const { data, error } = await this.client
        .from('rooms')
        .select('*')
        .eq('room_code', code)
        .maybeSingle();

      if (error) {
        console.error('[SupabaseService] getRoomByCode error:', error.message);
        return null;
      }
      return data as DbRoom;
    }

    return this.mockRooms.get(code) || null;
  }

  public async getRoomById(roomId: string): Promise<DbRoom | null> {
    if (this.client) {
      const { data, error } = await this.client
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle();

      if (error) {
        console.error('[SupabaseService] getRoomById error:', error.message);
        return null;
      }
      return data as DbRoom;
    }

    for (const r of this.mockRooms.values()) {
      if (r.id === roomId) return r;
    }
    return null;
  }

  public async updateRoomStatus(
    roomCode: string,
    status: DbRoom['status']
  ): Promise<DbRoom | null> {
    const code = roomCode.trim().toUpperCase();
    const now = new Date().toISOString();

    if (this.client) {
      const { data, error } = await this.client
        .from('rooms')
        .update({
          status,
          last_activity_at: now,
        })
        .eq('room_code', code)
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('[SupabaseService] updateRoomStatus error:', error.message);
        return null;
      }
      return data as DbRoom;
    }

    const room = this.mockRooms.get(code);
    if (!room) return null;

    room.status = status;
    room.last_activity_at = now;
    return room;
  }

  public async setRoomGuest(
    roomCode: string,
    guestPlayerId: string
  ): Promise<DbRoom | null> {
    const code = roomCode.trim().toUpperCase();
    const now = new Date().toISOString();

    if (this.client) {
      const room = await this.getRoomByCode(code);
      if (!room) return null;

      // Add guest to room_members (enforces strictly 2 capacity via DB trigger)
      await this.addMember(room.id, guestPlayerId, 'guest');

      const { data, error } = await this.client
        .from('rooms')
        .update({
          guest_player_id: guestPlayerId,
          status: 'READY',
          last_activity_at: now,
        })
        .eq('room_code', code)
        .select('*')
        .single();

      if (error) {
        console.error('[SupabaseService] setRoomGuest error:', error.message);
        return null;
      }
      return data as DbRoom;
    }

    const room = this.mockRooms.get(code);
    if (!room) return null;

    // Check capacity in mock mode
    await this.addMember(room.id, guestPlayerId, 'guest');

    room.guest_player_id = guestPlayerId;
    room.status = 'READY';
    room.last_activity_at = now;
    return room;
  }

  public async updateRoomActivity(roomCode: string, timestamp?: string): Promise<void> {
    const code = roomCode.trim().toUpperCase();
    const activityTime = timestamp || new Date().toISOString();

    if (this.client) {
      await this.client
        .from('rooms')
        .update({ last_activity_at: activityTime })
        .eq('room_code', code);
      return;
    }

    const room = this.mockRooms.get(code);
    if (room) {
      room.last_activity_at = activityTime;
    }
  }

  public async closeRoom(roomCode: string): Promise<void> {
    const code = roomCode.trim().toUpperCase();
    const now = new Date().toISOString();

    if (this.client) {
      await this.client
        .from('rooms')
        .update({
          status: 'CLOSED',
          last_activity_at: now,
        })
        .eq('room_code', code);
      return;
    }

    const room = this.mockRooms.get(code);
    if (room) {
      room.status = 'CLOSED';
      room.last_activity_at = now;
    }
  }

  // ============================================================================
  // ROOM MEMBERS (STRICTLY 2 CAPACITY ENFORCEMENT)
  // ============================================================================

  public async addMember(
    roomId: string,
    playerId: string,
    role: 'host' | 'guest'
  ): Promise<DbRoomMember> {
    const now = new Date().toISOString();

    if (this.client) {
      // 1. Check existing members
      const existingMembers = await this.getMembers(roomId);
      const alreadyMember = existingMembers.find((m) => m.player_id === playerId);
      if (alreadyMember) {
        await this.updateMemberLastSeen(roomId, playerId);
        return alreadyMember;
      }

      // 2. Strict capacity check on server side before insert
      if (existingMembers.length >= 2) {
        throw new Error('ROOM_FULL: Maximum allowed room participants is strictly 2.');
      }

      // 3. Insert new member (also guarded by PostgreSQL trigger check_room_capacity)
      const { data, error } = await this.client
        .from('room_members')
        .insert({
          room_id: roomId,
          player_id: playerId,
          role,
          joined_at: now,
          last_seen_at: now,
        })
        .select('*')
        .single();

      if (error) {
        // If unique constraint violation, update presence and return existing member
        if (error.code === '23505') {
          await this.updateMemberLastSeen(roomId, playerId);
          const existing = await this.getMembers(roomId);
          const found = existing.find((m) => m.player_id === playerId);
          if (found) return found;
        }
        if (error.message?.includes('ROOM_FULL') || error.code === '23514' || error.message?.includes('check_violation')) {
          throw new Error('ROOM_FULL: Maximum allowed room participants is strictly 2.');
        }
        console.error('[SupabaseService] addMember error:', error.message);
        throw new Error(`Failed to add member: ${error.message}`);
      }
      return data as DbRoomMember;
    }

    // Mock Mode capacity & membership logic
    let members = this.mockMembers.get(roomId) || [];
    const already = members.find((m) => m.player_id === playerId);
    if (already) {
      already.last_seen_at = now;
      return already;
    }

    if (members.length >= 2) {
      throw new Error('ROOM_FULL: Maximum allowed room participants is strictly 2.');
    }

    const newMember: DbRoomMember = {
      id: `member_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      room_id: roomId,
      player_id: playerId,
      role,
      joined_at: now,
      last_seen_at: now,
    };

    members.push(newMember);
    this.mockMembers.set(roomId, members);
    return newMember;
  }

  public async getMembers(roomId: string): Promise<DbRoomMember[]> {
    if (this.client) {
      const { data, error } = await this.client
        .from('room_members')
        .select('*')
        .eq('room_id', roomId);

      if (error) {
        console.error('[SupabaseService] getMembers error:', error.message);
        return [];
      }
      return (data || []) as DbRoomMember[];
    }

    return this.mockMembers.get(roomId) || [];
  }

  public async updateMemberLastSeen(roomId: string, playerId: string): Promise<void> {
    const now = new Date().toISOString();

    if (this.client) {
      await this.client
        .from('room_members')
        .update({ last_seen_at: now })
        .eq('room_id', roomId)
        .eq('player_id', playerId);
      return;
    }

    const members = this.mockMembers.get(roomId);
    const member = members?.find((m) => m.player_id === playerId);
    if (member) {
      member.last_seen_at = now;
    }
  }

  public async removeMember(roomId: string, playerId: string): Promise<void> {
    if (this.client) {
      await this.client
        .from('room_members')
        .delete()
        .eq('room_id', roomId)
        .eq('player_id', playerId);
      return;
    }

    const members = this.mockMembers.get(roomId);
    if (members) {
      this.mockMembers.set(
        roomId,
        members.filter((m) => m.player_id !== playerId)
      );
    }
  }

  // ============================================================================
  // MOVIE METADATA
  // ============================================================================

  public async saveMovieMetadata(data: {
    room_id: string;
    uploaded_by: string;
    original_filename: string;
    file_size: number;
    content_type?: string;
    r2_object_key: string;
    upload_status?: 'UPLOADING' | 'READY' | 'PLAYING' | 'ERROR' | 'DELETED';
  }): Promise<DbMovieMetadata> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    if (this.client) {
      const { data: saved, error } = await this.client
        .from('movie_metadata')
        .insert({
          room_id: data.room_id,
          uploaded_by: data.uploaded_by,
          original_filename: data.original_filename,
          file_size: data.file_size,
          content_type: data.content_type || 'video/mp4',
          r2_object_key: data.r2_object_key,
          upload_status: data.upload_status || 'READY',
          created_at: nowIso,
          expires_at: expiresAt,
        })
        .select('*')
        .single();

      if (error) {
        console.error('[SupabaseService] saveMovieMetadata error:', error.message);
        throw new Error(`Failed to save movie metadata: ${error.message}`);
      }
      return saved as DbMovieMetadata;
    }

    const mockMeta: DbMovieMetadata = {
      id: `movie_${Date.now()}`,
      room_id: data.room_id,
      uploaded_by: data.uploaded_by,
      original_filename: data.original_filename,
      file_size: data.file_size,
      content_type: data.content_type || 'video/mp4',
      r2_object_key: data.r2_object_key,
      upload_status: data.upload_status || 'READY',
      created_at: nowIso,
      expires_at: expiresAt,
    };

    this.mockMovies.set(data.room_id, mockMeta);
    return mockMeta;
  }

  public async getMovieMetadata(roomId: string): Promise<DbMovieMetadata | null> {
    if (this.client) {
      const { data, error } = await this.client
        .from('movie_metadata')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[SupabaseService] getMovieMetadata error:', error.message);
        return null;
      }
      return data as DbMovieMetadata;
    }

    return this.mockMovies.get(roomId) || null;
  }

  public async deleteMovieMetadata(roomId: string): Promise<void> {
    if (this.client) {
      await this.client.from('movie_metadata').delete().eq('room_id', roomId);
      return;
    }
    this.mockMovies.delete(roomId);
  }

  // ============================================================================
  // INACTIVITY CLEANUP (30 MINUTES COORDINATION)
  // ============================================================================

  public async cleanupInactiveRooms(inactivityMinutes: number = 30): Promise<string[]> {
    const cutoffTime = new Date(Date.now() - inactivityMinutes * 60 * 1000).toISOString();
    const cleanedCodes: string[] = [];

    if (this.client) {
      // Find inactive rooms that are older than cutoff
      const { data: expiredRooms, error } = await this.client
        .from('rooms')
        .select('room_code')
        .lt('last_activity_at', cutoffTime)
        .neq('status', 'CLOSED');

      if (error) {
        console.error('[SupabaseService] cleanupInactiveRooms query error:', error.message);
        return [];
      }

      for (const r of expiredRooms || []) {
        await this.closeRoom(r.room_code);
        cleanedCodes.push(r.room_code);
      }
      return cleanedCodes;
    }

    // Mock mode cleanup
    const cutoffMs = Date.now() - inactivityMinutes * 60 * 1000;
    for (const [code, r] of this.mockRooms.entries()) {
      const lastActive = new Date(r.last_activity_at).getTime();
      if (lastActive < cutoffMs && r.status !== 'CLOSED') {
        r.status = 'CLOSED';
        cleanedCodes.push(code);
      }
    }
    return cleanedCodes;
  }
}

export const supabaseService = new SupabaseService();
