import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Center, Float } from '@react-three/drei';
import { Sparkles, ArrowLeft, Check, Heart, User, Palette } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { StylizedAvatar } from '../characters/StylizedAvatar';
import { apiUrl } from '../services/apiConfig';
import { CharacterAppearance } from '../types';

export const CharacterCreation: React.FC = () => {
  const setView = useAppStore((state) => state.setView);
  const profile = useAppStore((state) => state.profile);
  const setProfile = useAppStore((state) => state.setProfile);
  const updateAppearance = useAppStore((state) => state.updateAppearance);

  const [name, setName] = useState(profile.characterName);
  const [gender, setGender] = useState<'boy' | 'girl'>(profile.appearance.gender || 'boy');
  const [clothingColor, setClothingColor] = useState(profile.appearance.clothingColor);
  const [hairColor, setHairColor] = useState(profile.appearance.hairColor);
  const [skinColor, setSkinColor] = useState(profile.appearance.skinColor);
  const [accessory, setAccessory] = useState<CharacterAppearance['accessory']>(profile.appearance.accessory);
  const [savedToast, setSavedToast] = useState(false);

  const selectPreset = (selectedGender: 'boy' | 'girl') => {
    setGender(selectedGender);
    if (selectedGender === 'boy') {
      setClothingColor('#faf6ee');
      setHairColor('#5c3317');
      setSkinColor('#ffe2c6');
      setAccessory('none');
    } else {
      setClothingColor('#f9a8d4');
      setHairColor('#4a2818');
      setSkinColor('#fff1e6');
      setAccessory('ribbon');
    }
  };

  // Cute color palettes
  const CLOTHING_PALETTE = [
    { name: 'Rose Petal', hex: '#ec4899' },
    { name: 'Golden Velvet', hex: '#f59e0b' },
    { name: 'Lavender Mist', hex: '#8b5cf6' },
    { name: 'Midnight Navy', hex: '#1e3a8a' },
    { name: 'Mint Cocoa', hex: '#10b981' },
    { name: 'Ruby Romance', hex: '#e11d48' },
  ];

  const HAIR_PALETTE = [
    { name: 'Midnight Plum', hex: '#3b0764' },
    { name: 'Espresso', hex: '#451a03' },
    { name: 'Warm Chestnut', hex: '#78350f' },
    { name: 'Caramel Honey', hex: '#d97706' },
    { name: 'Pastel Lilac', hex: '#c084fc' },
    { name: 'Pink Champagne', hex: '#f472b6' },
  ];

  const SKIN_PALETTE = [
    { name: 'Rosy Blush', hex: '#fbcfe8' },
    { name: 'Warm Peach', hex: '#fed7aa' },
    { name: 'Porcelain Ivory', hex: '#fef3c7' },
    { name: 'Almond Tan', hex: '#fcd34d' },
    { name: 'Warm Mocha', hex: '#d97706' },
  ];

  const ACCESSORIES: Array<{ id: CharacterAppearance['accessory']; label: string }> = [
    { id: 'ribbon', label: 'Cute Ribbon' },
    { id: 'star_clip', label: 'Star Clip' },
    { id: 'none', label: 'None' },
  ];

  const handleSave = () => {
    const trimmed = name.trim() || 'Sweetheart';
    setProfile({
      characterName: trimmed,
    });
    updateAppearance({
      gender,
      clothingColor,
      hairColor,
      skinColor,
      accessory,
    });

    // Asynchronously save profile to backend / Supabase
    fetch(apiUrl('/api/profiles'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: profile.userId,
        display_name: trimmed,
        avatar_config: {
          gender,
          colorScheme: 'custom',
          clothingColor,
          hairColor,
          skinColor,
          accessory,
          eyeStyle: 'sparkle',
        },
      }),
    }).catch((err) => console.warn('[CharacterCreation] Profile API sync notice:', err.message));

    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      setView('DASHBOARD');
    }, 1000);
  };

  const previewAppearance: CharacterAppearance = {
    gender,
    colorScheme: 'custom',
    clothingColor,
    hairColor,
    skinColor,
    accessory,
    eyeStyle: 'sparkle',
  };

  return (
    <div className="min-h-screen bg-theatre-darkest p-4 sm:p-8 flex flex-col justify-between relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-theatre-pink/15 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Header */}
      <div className="w-full max-w-6xl mx-auto flex items-center justify-between z-10 mb-6">
        <button
          onClick={() => setView('DASHBOARD')}
          className="flex items-center gap-2 text-sm text-slate-300 hover:text-white px-4 py-2 rounded-2xl glass-panel border border-white/10 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>

        <div className="text-right">
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 justify-end">
            <span>Character Atelier</span>
            <Sparkles className="w-5 h-5 text-theatre-gold" />
          </h1>
          <p className="text-xs text-slate-400">Design your adorable 3D virtual cinema persona</p>
        </div>
      </div>

      {/* Main Studio: 3D Preview (Left) + Customizer Controls (Right) */}
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center flex-1 z-10">
        {/* 3D Character Preview Canvas (7 cols on large screens) */}
        <div className="lg:col-span-7 h-[380px] sm:h-[480px] glass-panel-pink rounded-3xl relative overflow-hidden flex flex-col items-center justify-center border border-theatre-pink/20 shadow-2xl">
          <div className="absolute top-4 left-4 z-10 px-3 py-1 rounded-full bg-theatre-dark/70 border border-white/10 text-xs text-theatre-blush flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 fill-current text-theatre-pink" />
            <span>Drag to rotate • 3D Real-time Preview</span>
          </div>

          <Canvas
            shadows
            camera={{ position: [0, 1.2, 3.2], fov: 45 }}
            className="w-full h-full cursor-grab active:cursor-grabbing"
          >
            <ambientLight intensity={0.8} />
            <directionalLight position={[3, 5, 4]} intensity={1.5} castShadow />
            <pointLight position={[-2, 1, 2]} intensity={0.5} color="#f43f5e" />
            <pointLight position={[2, 1, -2]} intensity={0.5} color="#f59e0b" />

            <Center>
              <Float speed={2} rotationIntensity={0.2} floatIntensity={0.3}>
                <StylizedAvatar
                  name={name || 'Your Name'}
                  appearance={previewAppearance}
                  animationState="IDLE"
                  isLocal={true}
                  showNameTag={true}
                />
              </Float>
            </Center>

            {/* Stage Pedestal */}
            <mesh position={[0, -0.05, 0]} receiveShadow>
              <cylinderGeometry args={[1.3, 1.4, 0.1, 32]} />
              <meshStandardMaterial color="#24174a" roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.01, 0]}>
              <cylinderGeometry args={[1.25, 1.25, 0.02, 32]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.7} roughness={0.3} />
            </mesh>

            <OrbitControls
              enablePan={false}
              minDistance={1.8}
              maxDistance={5.0}
              maxPolarAngle={Math.PI / 2 + 0.1}
              minPolarAngle={Math.PI / 4}
            />
          </Canvas>
        </div>

        {/* Customization Options (5 cols on large screens) */}
        <div className="lg:col-span-5 glass-panel rounded-3xl p-6 sm:p-8 space-y-6 border border-white/10 shadow-2xl">
          {/* Preset Selector: Boy or Girl */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-theatre-gold uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Choose Character Model
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => selectPreset('boy')}
                className={`py-3 px-4 rounded-2xl flex items-center justify-center gap-2 border font-bold text-xs transition ${
                  gender === 'boy'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.3)]'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                }`}
              >
                <span>👦 Boy (Teddy Hoodie)</span>
              </button>
              <button
                type="button"
                onClick={() => selectPreset('girl')}
                className={`py-3 px-4 rounded-2xl flex items-center justify-center gap-2 border font-bold text-xs transition ${
                  gender === 'girl'
                    ? 'bg-pink-500/20 border-pink-400 text-pink-200 shadow-[0_0_12px_rgba(244,114,182,0.3)]'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                }`}
              >
                <span>👧 Girl (Pink Ribbon)</span>
              </button>
            </div>
          </div>

          {/* Character Name Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-theatre-gold uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Character Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sweetheart, Maya, Alex"
              maxLength={20}
              className="w-full glass-input rounded-2xl px-4 py-3 text-white text-sm placeholder-slate-500 font-medium"
            />
          </div>

          {/* Clothing Palette */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-theatre-pink" />
              Sweater & Outfit Color
            </label>
            <div className="flex flex-wrap gap-2.5">
              {CLOTHING_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => setClothingColor(c.hex)}
                  className={`w-9 h-9 rounded-2xl transition-transform active:scale-90 border-2 relative ${
                    clothingColor === c.hex ? 'scale-110 border-white shadow-glow-pink' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                >
                  {clothingColor === c.hex && (
                    <Check className="w-4 h-4 text-white mx-auto drop-shadow" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Hair Color Palette */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Hair Color
            </label>
            <div className="flex flex-wrap gap-2.5">
              {HAIR_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => setHairColor(c.hex)}
                  className={`w-9 h-9 rounded-2xl transition-transform active:scale-90 border-2 relative ${
                    hairColor === c.hex ? 'scale-110 border-white shadow-glow-gold' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                >
                  {hairColor === c.hex && (
                    <Check className="w-4 h-4 text-white mx-auto drop-shadow" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Skin Tone Palette */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Skin Tone
            </label>
            <div className="flex flex-wrap gap-2.5">
              {SKIN_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => setSkinColor(c.hex)}
                  className={`w-9 h-9 rounded-2xl transition-transform active:scale-90 border-2 relative ${
                    skinColor === c.hex ? 'scale-110 border-white shadow-glow-pink' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                >
                  {skinColor === c.hex && (
                    <Check className="w-4 h-4 text-slate-800 mx-auto drop-shadow" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Accessory Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Accessory
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ACCESSORIES.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => setAccessory(acc.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-medium border transition ${
                    accessory === acc.id
                      ? 'bg-theatre-pink/20 border-theatre-pink text-white shadow-glow-pink'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-theatre-pink to-pink-600 text-white font-bold text-sm shadow-glow-pink hover:brightness-110 active:scale-95 transition flex items-center justify-center gap-2 mt-4"
          >
            {savedToast ? (
              <>
                <Check className="w-5 h-5 text-emerald-300" />
                <span>Profile Saved!</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Save Character & Continue</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="w-full max-w-6xl mx-auto py-4 text-center text-xs text-slate-500">
        Changes persist locally in your browser storage.
      </div>
    </div>
  );
};

