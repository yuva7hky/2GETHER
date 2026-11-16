import React, { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { LandingPage } from './pages/LandingPage';
import { CharacterCreation } from './pages/CharacterCreation';
import { HomeDashboard } from './pages/HomeDashboard';
import { VirtualTheatre } from './pages/VirtualTheatre';
import { socketService } from './services/socketService';

export const App: React.FC = () => {
  const currentView = useAppStore((state) => state.currentView);
  const setView = useAppStore((state) => state.setView);

  // Check URL query parameters for direct room invitation link (e.g. ?room=LOVE88)
  useEffect(() => {
    socketService.connect();

    const params = new URLSearchParams(window.location.search);
    const inviteRoom = params.get('room');
    if (inviteRoom) {
      console.log('[App] Detected invitation link for room:', inviteRoom);
      socketService.joinRoom(
        inviteRoom,
        () => {
          setView('THEATRE');
        },
        (err) => {
          console.warn('[App] Could not auto-join from URL param:', err);
          setView('DASHBOARD');
        }
      );
    }
  }, [setView]);

  return (
    <div className="w-full min-h-screen bg-theatre-darkest text-slate-100 font-['Outfit',sans-serif]">
      {currentView === 'LANDING' && <LandingPage />}
      {currentView === 'CHARACTER_CREATION' && <CharacterCreation />}
      {(currentView === 'DASHBOARD' || currentView === 'CREATE_ROOM' || currentView === 'JOIN_ROOM') && (
        <HomeDashboard />
      )}
      {currentView === 'THEATRE' && <VirtualTheatre />}
    </div>
  );
};
export default App;
