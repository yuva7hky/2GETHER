import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageCircle, X, Sparkles, Heart } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { socketService } from '../services/socketService';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({ isOpen, onClose }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = useAppStore((state) => state.messages);
  const profile = useAppStore((state) => state.profile);
  const connected = useAppStore((state) => state.connected);
  const resetUnread = useAppStore((state) => state.resetUnread);

  useEffect(() => {
    if (isOpen) {
      resetUnread();
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages.length]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    socketService.sendChatMessage(inputText);
    setInputText('');
  };

  const sendQuickEmoji = (emoji: string) => {
    socketService.sendChatMessage(emoji);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-96 z-50 glass-panel-pink flex flex-col shadow-2xl border-l border-white/10 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-theatre-dark/60">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-theatre-pink" />
          <h2 className="font-semibold text-lg tracking-wide">Theatre Whispers</h2>
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              connected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-500'
            }`}
            title={connected ? 'Connected' : 'Disconnected'}
          />
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages List */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <Heart className="w-10 h-10 text-theatre-pink/40 animate-pulse mb-3" />
            <p className="text-sm font-medium text-slate-300">Quiet in the cinema...</p>
            <p className="text-xs text-slate-500 mt-1">Whisper something sweet to your partner!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === profile.userId;
            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="text-[11px] text-slate-400 px-1 mb-0.5 flex items-center gap-1.5">
                  <span className={isMe ? 'text-theatre-gold font-medium' : 'text-theatre-softPink font-medium'}>
                    {msg.senderName}
                  </span>
                  <span>{timeStr}</span>
                </div>
                <div
                  className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-sm break-words shadow-md ${
                    isMe
                      ? 'bg-gradient-to-r from-theatre-pink to-pink-600 text-white rounded-tr-none'
                      : 'bg-theatre-surface/90 text-slate-100 rounded-tl-none border border-white/10'
                  }`}
                >
                  {msg.message}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Emote Pills */}
      <div className="px-4 py-2 border-t border-white/5 flex gap-2 overflow-x-auto bg-theatre-dark/40">
        {['♥', '🍿', '🎬', '✨', '😍', '🥺', '🍫', '🥂'].map((emo) => (
          <button
            key={emo}
            onClick={() => sendQuickEmoji(emo)}
            className="px-2.5 py-1 text-sm rounded-full bg-white/5 hover:bg-white/15 border border-white/10 transition active:scale-95"
          >
            {emo}
          </button>
        ))}
      </div>

      {/* Input Field */}
      <form onSubmit={handleSend} className="p-3 border-t border-white/10 bg-theatre-dark/80 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Whisper a message..."
          maxLength={1000}
          className="flex-1 glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-400"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="px-4 rounded-xl bg-gradient-to-r from-theatre-pink to-pink-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 active:scale-95 transition flex items-center justify-center shadow-glow-pink"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

