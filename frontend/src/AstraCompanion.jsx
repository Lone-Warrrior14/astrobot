import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Sparkles, Volume2, VolumeX, Minimize2, Send, Paperclip, Command, 
  ImageIcon, Figma, MonitorIcon, Lightbulb, Search, Flame
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './lib/utils';

/**
 * Clean speech input by stripping emojis, code symbols and excessive formatting
 */
export const cleanForSpeech = (rawText) => {
  if (!rawText) return '';
  return rawText
    // Strip markdown formatting like **bold**, *italic*, `code`, # headings, > quotes
    .replace(/```[\s\S]*?```/g, 'code snippet omitted')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/[#*>\-_~]/g, '')
    // Remove Unicode emojis, pictographs, symbols and variation selectors
    .replace(/\p{Extended_Pictographic}/ug, '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[✨💤😴☀️😆💖🧠💬🎉👀🌟🥰💫]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const speakAstra = (text, isMuted, onStart, onEnd) => {
  if (isMuted || !window.speechSynthesis) {
    if (onEnd) onEnd();
    return;
  }

  try {
    const cleanText = cleanForSpeech(text);
    if (!cleanText) {
      if (onEnd) onEnd();
      return;
    }

    // Cancel any previous utterances
    window.speechSynthesis.cancel();

    // Use Web Audio API micro-tick to wake audio hardware immediately
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      }
    } catch (_) {}

    setTimeout(() => {
      try {
        // Prepend leading pause punctuation (comma & ellipsis) so the audio driver
        // spins up on the silent pause rather than clipping the first word!
        const paddedText = `, ... ${cleanText}`;
        const utterance = new SpeechSynthesisUtterance(paddedText);

        // Cute, friendly mascot parameters: higher pitch, calm cadence
        utterance.pitch = 1.35;
        utterance.rate = 0.90;
        utterance.volume = 0.95;

        // Pick preferred English voice if available
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const preferredVoice = voices.find(v => 
            v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Female') || v.name.includes('Google') || v.name.includes('Samantha'))
          ) || voices.find(v => v.lang.startsWith('en'));
          if (preferredVoice) utterance.voice = preferredVoice;
        }

        let ended = false;
        const finish = () => {
          if (!ended) {
            ended = true;
            if (onEnd) onEnd();
          }
        };

        const maxWaitMs = Math.max(4000, (cleanText.length / 8) * 1000);
        const safetyTimer = setTimeout(finish, maxWaitMs);

        utterance.onend = () => {
          clearTimeout(safetyTimer);
          finish();
        };
        utterance.onerror = (e) => {
          clearTimeout(safetyTimer);
          finish();
        };

        if (onStart) utterance.onstart = onStart;

        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utterance);
      } catch (innerErr) {
        console.warn("Astra inner voice error:", innerErr);
        if (onEnd) onEnd();
      }
    }, 120);
  } catch (err) {
    console.warn("Astra voice error:", err);
    if (onEnd) onEnd();
  }
};

export default function AstraCompanion({ 
  isVisible, 
  onClose, 
  isStreaming, 
  isThinking,
  inputText = '',
  isAstraOnly = false,
  onExitAstraOnly,
  latestReply = '',
  onSendMessage
}) {
  const [animState, setAnimState] = useState('entry');
  const [speechBubble, setSpeechBubble] = useState("Hey there! Astra is here! ✨");
  const [isMuted, setIsMuted] = useState(false);
  const [localInput, setLocalInput] = useState('');
  const [position, setPosition] = useState({ x: window.innerWidth - 220, y: window.innerHeight - 260 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Animated Chat states for AstraOnly
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [inputFocused, setInputFocused] = useState(false);
  const commandPaletteRef = useRef(null);

  const commandSuggestions = [
    { icon: <Search className="w-4 h-4 text-emerald-400" />, label: "Web Research", description: "Search live web with SearXNG", prefix: "research " },
    { icon: <Sparkles className="w-4 h-4 text-cyan-400" />, label: "Generate Image", description: "Create SDXL image", prefix: "create a image of " },
    { icon: <Lightbulb className="w-4 h-4 text-amber-400" />, label: "Remember Fact", description: "Store in long-term memory", prefix: "remember " },
    { icon: <Flame className="w-4 h-4 text-rose-400" />, label: "Talk Persona", description: "Casual friend chat", prefix: "hey astra, " },
  ];

  // Track mouse coordinates for background glowing mesh
  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const purrAudioRef = useRef(null);
  const boopAudioRef = useRef(null);
  const voiceBoopAudioRef = useRef(null);
  const boopToggleRef = useRef(false); // Alternate between chime boop and human voice boop
  const idleTimerRef = useRef(null);
  const tempActionTimerRef = useRef(null);

  // Initialize purr and boop sound effects
  useEffect(() => {
    purrAudioRef.current = new Audio('/astra_gifs/purr.wav');
    purrAudioRef.current.volume = 0.85;

    boopAudioRef.current = new Audio('/astra_gifs/boop.wav');
    boopAudioRef.current.volume = 0.90;

    voiceBoopAudioRef.current = new Audio('/astra_gifs/voice_boop.wav');
    voiceBoopAudioRef.current.volume = 0.95;
  }, []);

  const playCatPurr = () => {
    if (isMutedRef.current || !purrAudioRef.current) return;
    try {
      purrAudioRef.current.currentTime = 0;
      purrAudioRef.current.play().catch(e => console.warn("Purr play error:", e));
    } catch (e) {}
  };

  const playBoopSound = () => {
    if (isMutedRef.current) return;
    try {
      // Use user's boop.mp3 audio
      const snd = new Audio('/astra_gifs/boop.mp3');
      snd.volume = 1.0;
      snd.play().catch(e => console.warn("Boop mp3 play error:", e));
    } catch (e) {
      console.warn("Boop sound exception:", e);
    }
  };
  const mouseMoveCountRef = useRef(0);
  const lastMoveTimeRef = useRef(0);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const astraSay = (text, preserveAnim = false) => {
    setSpeechBubble(text);
    if (!preserveAnim) {
      setAnimState('speaking');
    }
    speakAstra(
      text, 
      isMutedRef.current,
      () => {
        if (!preserveAnim) setAnimState('speaking');
      },
      () => {
        if (!preserveAnim) {
          setAnimState('idle');
          resetIdleTimer();
        }
      }
    );
  };

  const resetIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setAnimState((curr) => {
        if (curr === 'idle' || curr === 'entry') {
          // Play sleepy voice line WITHOUT letting speech onEnd kick it back to idle!
          setSpeechBubble("Getting cozy and sleepy... 💤");
          speakAstra("Getting cozy and sleepy", isMutedRef.current);
          return 'sleep_begin';
        }
        return curr;
      });
    }, 12000);
  };

  // When /astraonly is activated, announce it cheerfully and play entry hi.gif
  useEffect(() => {
    if (isAstraOnly) {
      setAnimState('entry'); // Plays hi.gif
      // Play entry hi.gif for 2.6s, then speak and transition smoothly to idle
      const hiTimer = setTimeout(() => {
        astraSay("Astra Only Mode activated! It's just you and me now! What's on your mind? ✨");
        setAnimState('idle');
        resetIdleTimer();
      }, 2600);

      return () => clearTimeout(hiTimer);
    }
  }, [isAstraOnly]);

  // Initial activation for normal mode
  useEffect(() => {
    if (isVisible && !isAstraOnly) {
      setAnimState('entry');
      setTimeout(() => {
        astraSay("Yaaay! Astra is here to help! ✨");
      }, 250);

      const entryTimer = setTimeout(() => {
        setAnimState('idle');
        setSpeechBubble('');
        resetIdleTimer();
      }, 2800);

      return () => {
        clearTimeout(entryTimer);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (tempActionTimerRef.current) clearTimeout(tempActionTimerRef.current);
        if (window.speechSynthesis) window.speechSynthesis.cancel();
      };
    }
  }, [isVisible, isAstraOnly]);

  // Sleep transition
  useEffect(() => {
    if (animState === 'sleep_begin') {
      const timer = setTimeout(() => {
        setAnimState('sleeping');
        setSpeechBubble("Zzz... 😴");
      }, 2400);
      return () => clearTimeout(timer);
    }
  }, [animState]);

  // Wake up with surprise reaction (wake_up.gif) as soon as user types in chat
  const combinedInput = isAstraOnly ? localInput : inputText;
  const prevInputRef = useRef('');

  useEffect(() => {
    if (!isVisible) return;
    const currentVal = combinedInput || '';
    const prevVal = prevInputRef.current || '';
    prevInputRef.current = currentVal;

    // Only trigger wakeup if user has genuinely typed NEW text (input changed from shorter/empty to longer)
    const isTypingNew = currentVal.trim().length > 0 && currentVal.length > prevVal.length;

    if (isTypingNew) {
      if (animState === 'sleeping' || animState === 'sleep_begin') {
        setAnimState('waking'); // plays wake_up.gif!
        setSpeechBubble("I'm awake! ☀️");
        speakAstra("I'm awake", isMutedRef.current);
        const wakeTimer = setTimeout(() => {
          setAnimState('idle');
          setSpeechBubble('');
          resetIdleTimer();
        }, 1800);
        return () => clearTimeout(wakeTimer);
      } else {
        resetIdleTimer();
      }
    }
  }, [combinedInput, isVisible]);

  // React to Chat Streaming & Thinking
  useEffect(() => {
    if (!isVisible) return;

    if (isThinking) {
      if (animState === 'sleeping' || animState === 'sleep_begin') {
        wakeUpThen('thinking', "Hmm, let me think! 🧠");
      } else {
        setAnimState('thinking');
        setSpeechBubble("Hmm, let me think! 🧠");
        // Only speak out loud if not muted, but do not override the animState back to idle!
        speakAstra("Hmm, let me think!", isMutedRef.current);
      }
    } else if (isStreaming) {
      if (animState === 'sleeping' || animState === 'sleep_begin') {
        wakeUpThen('speaking', "Here's what I think! 💬");
      } else {
        setAnimState('speaking');
        if (!isAstraOnly) {
          setSpeechBubble("Answering... 💬");
        }
      }
    } else {
      // Completed streaming
      if (animState === 'speaking' || animState === 'thinking') {
        if (isAstraOnly && latestReply) {
          // In Astra-Only mode, set speaking animation while speaking the full reply out loud!
          setAnimState('speaking');
          setSpeechBubble(latestReply);
          speakAstra(
            latestReply, 
            isMutedRef.current,
            () => setAnimState('speaking'),
            () => {
              setAnimState('celebrating');
              setTimeout(() => {
                setAnimState('idle');
                resetIdleTimer();
              }, 2200);
            }
          );
        } else {
          setAnimState('celebrating');
          astraSay("Woohoo! All done! 🎉");
          const celTimer = setTimeout(() => {
            setAnimState('idle');
            setSpeechBubble('');
            resetIdleTimer();
          }, 2400);
          return () => clearTimeout(celTimer);
        }
      }
    }
  }, [isStreaming, isThinking, isVisible, isAstraOnly, latestReply]);

  const wakeUpThen = (nextState, bubbleMsg) => {
    setAnimState('waking');
    astraSay("I'm awake! ☀️");
    setTimeout(() => {
      setAnimState(nextState);
      if (bubbleMsg) astraSay(bubbleMsg);
      if (nextState === 'idle') resetIdleTimer();
    }, 1600);
  };

  const handleHeadPoke = (e) => {
    e.stopPropagation();
    if (tempActionTimerRef.current) clearTimeout(tempActionTimerRef.current);

    // Play sound on every single tap/click!
    playBoopSound();

    if (animState === 'sleeping' || animState === 'sleep_begin') {
      wakeUpThen('poking');
      tempActionTimerRef.current = setTimeout(() => {
        setAnimState('idle');
        setSpeechBubble('');
        resetIdleTimer();
      }, 2600);
      return;
    }

    // Force animation state re-trigger even when clicking repeatedly in place
    setAnimState('idle');
    requestAnimationFrame(() => {
      setAnimState('poking');
      setSpeechBubble("Boop! ✨");
    });

    tempActionTimerRef.current = setTimeout(() => {
      setAnimState('idle');
      setSpeechBubble('');
      resetIdleTimer();
    }, 1500);
  };

  const handleHeadRub = (e) => {
    const now = Date.now();
    if (now - lastMoveTimeRef.current < 80) return;
    lastMoveTimeRef.current = now;
    mouseMoveCountRef.current += 1;

    if (mouseMoveCountRef.current > 4 && animState !== 'rubbing' && animState !== 'entry') {
      mouseMoveCountRef.current = 0;
      if (tempActionTimerRef.current) clearTimeout(tempActionTimerRef.current);

      // Play soothing cat purr sound instead of text speech
      playCatPurr();
      setAnimState('rubbing');
      setSpeechBubble("Purrrrr... 🥰💖");

      tempActionTimerRef.current = setTimeout(() => {
        setAnimState('idle');
        setSpeechBubble('');
        resetIdleTimer();
      }, 2800);
    }
  };

  const handleWidgetClick = () => {
    if (animState === 'sleeping' || animState === 'sleep_begin') {
      wakeUpThen('idle', "Astra is up and ready! 🌟");
    } else {
      resetIdleTimer();
    }
  };

  // Draggable mascot support (only in floating mode, not fullscreen astra-only)
  const handleMouseDown = (e) => {
    if (isAstraOnly) return;
    if (e.target.closest('.astra-btn') || e.target.closest('.astra-head-zone')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  useEffect(() => {
    if (isAstraOnly) return;
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: Math.max(10, Math.min(window.innerWidth - 180, e.clientX - dragOffset.x)),
        y: Math.max(10, Math.min(window.innerHeight - 220, e.clientY - dragOffset.y))
      });
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, isAstraOnly]);

  if (!isVisible) return null;

  let currentGif = '/astra_gifs/idle.gif';
  switch (animState) {
    case 'entry':
      currentGif = '/astra_gifs/hi.gif';
      break;
    case 'thinking':
      currentGif = '/astra_gifs/think.gif';
      break;
    case 'speaking':
      currentGif = '/astra_gifs/speak.gif';
      break;
    case 'celebrating':
      currentGif = '/astra_gifs/celebration.gif';
      break;
    case 'sleep_begin':
      currentGif = '/astra_gifs/sleep_begin.gif';
      break;
    case 'sleeping':
      currentGif = '/astra_gifs/sleep_loop.gif';
      break;
    case 'waking':
      currentGif = '/astra_gifs/wake_up.gif';
      break;
    case 'poking':
      currentGif = '/astra_gifs/poke.gif';
      break;
    case 'rubbing':
      currentGif = '/astra_gifs/head_rub.gif';
      break;
    case 'idle':
    default:
      currentGif = '/astra_gifs/idle.gif';
      break;
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER: /astraonly FULLSCREEN IMMERSIVE COMPANION VIEW
  // ══════════════════════════════════════════════════════════════════════
  if (isAstraOnly) {
    return (
      <div 
        className="astra-only-backdrop relative w-screen h-screen overflow-hidden flex flex-col items-center justify-between text-white p-6 select-none"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 99999,
          background: 'radial-gradient(circle at 50% 30%, #0d1e17 0%, #050b08 100%)',
        }}
      >
        {/* Animated Background Mesh Orbs (similar to AnimatedAIChat) */}
        <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden z-0">
          <div className="absolute top-10 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full filter blur-[128px] animate-pulse" />
          <div className="absolute bottom-12 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full filter blur-[128px] animate-pulse delay-700" />
          <div className="absolute top-1/3 right-1/3 w-64 h-64 bg-cyan-500/10 rounded-full filter blur-[96px] animate-pulse delay-1000" />
        </div>

        {/* Dynamic Mouse Tracking Radial Beam */}
        {inputFocused && (
          <motion.div 
            className="fixed w-[45rem] h-[45rem] rounded-full pointer-events-none z-0 opacity-15 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 blur-[100px]"
            animate={{
              x: mousePosition.x - 360,
              y: mousePosition.y - 360,
            }}
            transition={{
              type: "spring",
              damping: 25,
              stiffness: 150,
              mass: 0.5,
            }}
          />
        )}

        {/* Top Floating Control Pill Bar */}
        <header className="relative z-20 w-full max-w-4xl flex items-center justify-between pt-2 px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Sparkles size={16} className="text-black" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-white/90">Astra Studio</h2>
              <span className="text-[11px] text-emerald-400 font-mono">Companion Mode</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const nextMuted = !isMuted;
                setIsMuted(nextMuted);
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                if (!nextMuted) speakAstra("Voice enabled!", false);
              }}
              title={isMuted ? "Unmute Voice" : "Mute Voice"}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 backdrop-blur-xl border transition-all",
                isMuted 
                  ? "bg-red-500/15 border-red-500/40 text-red-400" 
                  : "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-500/10"
              )}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              <span>{isMuted ? 'Muted' : 'Astra Voice Active'}</span>
            </button>

            <button
              onClick={() => {
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                onExitAstraOnly();
              }}
              title="Return to Standard Chat"
              className="px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white/80 transition-all backdrop-blur-xl"
            >
              <Minimize2 size={13} />
              <span>Exit Studio</span>
            </button>
          </div>
        </header>

        {/* Center Mascot & Interactive Speech Area */}
        <main className="relative z-10 flex flex-col items-center justify-center max-w-2xl w-full my-auto text-center px-4">
          {/* Animated Glowing Speech Bubble */}
          <AnimatePresence>
            {speechBubble && (
              <motion.div 
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="backdrop-blur-2xl bg-white/[0.04] border border-emerald-500/30 rounded-2xl p-5 mb-6 max-w-xl text-center shadow-2xl shadow-emerald-950/40"
              >
                <div className="flex items-center justify-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  <Sparkles size={13} />
                  <span>Astra</span>
                </div>
                <p className="text-base sm:text-lg text-emerald-50 font-medium leading-relaxed">
                  {speechBubble}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Big Mascot Frame with Radial Glow */}
          <div 
            onClick={handleWidgetClick}
            className="relative w-64 h-64 sm:w-80 sm:h-80 rounded-full flex items-center justify-center cursor-pointer transition-transform duration-300 hover:scale-105"
            style={{
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.22) 0%, rgba(6, 78, 59, 0.12) 50%, transparent 75%)',
              boxShadow: '0 0 100px rgba(16, 185, 129, 0.25)'
            }}
          >
            {/* Interactive head touch zone */}
            <div 
              className="astra-head-zone"
              onClick={handleHeadPoke}
              onMouseMove={handleHeadRub}
              title="Poke or rub Astra's head!"
              style={{
                position: 'absolute',
                top: '25px',
                width: '180px',
                height: '140px',
                borderRadius: '50%',
                zIndex: 20,
                cursor: 'pointer'
              }}
            />

            <img 
              src={currentGif} 
              alt="Astra Companion" 
              onError={(e) => {
                e.target.src = '/astra_gifs/idle.gif';
              }}
              className="w-56 h-56 sm:w-72 sm:h-72 object-contain pointer-events-none drop-shadow-[0_20px_35px_rgba(16,185,129,0.35)]"
            />
          </div>

          <div className="mt-4 text-xs font-mono tracking-wider text-emerald-400/60 uppercase">
            {animState === 'sleeping' 
              ? '😴 Astra is napping (type below or click to wake)' 
              : '✨ Tap head to poke • Rub head to pet'}
          </div>
        </main>

        {/* Bottom Floating Command Bar & Input (Animated AI Chat Style) */}
        <footer className="relative z-20 w-full max-w-2xl pb-4">
          <motion.div 
            className="relative backdrop-blur-2xl bg-white/[0.03] rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/60 overflow-hidden"
            initial={{ scale: 0.98 }}
            animate={{ scale: 1 }}
          >
            {/* Command Palette Dropdown */}
            <AnimatePresence>
              {showCommandPalette && (
                <motion.div 
                  ref={commandPaletteRef}
                  className="absolute left-3 right-3 bottom-full mb-2 backdrop-blur-xl bg-black/90 rounded-xl z-50 shadow-2xl border border-emerald-500/20 overflow-hidden"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="py-1">
                    {commandSuggestions.map((suggestion, index) => (
                      <div
                        key={suggestion.prefix}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 text-xs transition-colors cursor-pointer",
                          activeSuggestion === index 
                            ? "bg-emerald-500/15 text-emerald-200" 
                            : "text-white/70 hover:bg-white/5"
                        )}
                        onClick={() => {
                          setLocalInput(suggestion.prefix);
                          setShowCommandPalette(false);
                        }}
                      >
                        <div className="w-5 h-5 flex items-center justify-center">
                          {suggestion.icon}
                        </div>
                        <div className="font-medium text-white">{suggestion.label}</div>
                        <div className="text-white/40 text-[11px] ml-auto font-mono">
                          {suggestion.prefix}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Box */}
            <div className="p-3 sm:p-4">
              <input 
                type="text"
                placeholder="Ask Astra anything... (Speaks answers out loud ✨)"
                value={localInput}
                onChange={(e) => {
                  setLocalInput(e.target.value);
                  if (e.target.value.startsWith('/')) {
                    setShowCommandPalette(true);
                  } else {
                    setShowCommandPalette(false);
                  }
                }}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && localInput.trim() && !isStreaming) {
                    const query = localInput.trim();
                    setLocalInput('');
                    setShowCommandPalette(false);
                    onSendMessage(query);
                  }
                }}
                className="w-full bg-transparent border-none text-white/90 text-sm sm:text-base outline-none placeholder:text-white/30"
              />
            </div>

            {/* Bottom Action Footer with Command Suggestions */}
            <div className="px-4 py-2.5 border-t border-white/[0.05] flex items-center justify-between gap-3 bg-white/[0.01]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCommandPalette(prev => !prev)}
                  title="Open Action Commands"
                  className={cn(
                    "p-1.5 text-white/40 hover:text-emerald-400 rounded-lg transition-colors flex items-center gap-1.5 text-xs",
                    showCommandPalette && "bg-emerald-500/15 text-emerald-400"
                  )}
                >
                  <Command className="w-4 h-4" />
                  <span className="hidden sm:inline">Commands</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (localInput.trim() && !isStreaming) {
                      const query = localInput.trim();
                      setLocalInput('');
                      setShowCommandPalette(false);
                      onSendMessage(query);
                    }
                  }}
                  disabled={!localInput.trim() || isStreaming}
                  className={cn(
                    "px-4 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
                    localInput.trim() && !isStreaming
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-black shadow-lg shadow-emerald-500/25 hover:scale-105 active:scale-95"
                      : "bg-white/[0.05] text-white/30 cursor-not-allowed"
                  )}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          </motion.div>

          {/* Quick Command Chips */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            {commandSuggestions.map((suggestion) => (
              <button
                key={suggestion.prefix}
                onClick={() => setLocalInput(suggestion.prefix)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.02] hover:bg-emerald-500/10 border border-white/[0.05] hover:border-emerald-500/30 rounded-lg text-xs text-white/60 hover:text-emerald-300 transition-all"
              >
                {suggestion.icon}
                <span>{suggestion.label}</span>
              </button>
            ))}
          </div>
        </footer>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER: NORMAL FLOATING CORNER COMPANION
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div 
      className="astra-companion-widget"
      onMouseDown={handleMouseDown}
      onClick={handleWidgetClick}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 99999,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        filter: 'drop-shadow(0 12px 24px rgba(0, 240, 255, 0.28))',
        transition: isDragging ? 'none' : 'transform 0.15s ease'
      }}
    >
      {/* Speech bubble */}
      {speechBubble && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.94)',
          color: '#38bdf8',
          border: '1px solid rgba(56, 189, 248, 0.45)',
          borderRadius: '12px',
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 600,
          marginBottom: '6px',
          maxWidth: '190px',
          textAlign: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)',
          animation: 'fadeIn 0.2s ease',
          pointerEvents: 'none'
        }}>
          {speechBubble}
        </div>
      )}

      {/* Main Mascot Card */}
      <div style={{
        position: 'relative',
        width: '150px',
        height: '150px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, rgba(56, 189, 248, 0.06) 50%, transparent 70%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Top Control Buttons: Mute Voice & Close */}
        <div style={{
          position: 'absolute',
          top: '2px',
          right: '2px',
          display: 'flex',
          gap: '4px',
          zIndex: 10
        }}>
          <button
            className="astra-btn"
            onClick={(e) => {
              e.stopPropagation();
              const nextMuted = !isMuted;
              setIsMuted(nextMuted);
              if (window.speechSynthesis) window.speechSynthesis.cancel();
              if (!nextMuted) speakAstra("Voice on!", false);
            }}
            title={isMuted ? "Unmute Astra's Voice" : "Mute Astra's Voice"}
            style={{
              background: isMuted ? 'rgba(239, 68, 68, 0.85)' : 'rgba(30, 41, 59, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '50%',
              color: '#fff',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>

          <button
            className="astra-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (window.speechSynthesis) window.speechSynthesis.cancel();
              onClose();
            }}
            title="Dismiss Astra Companion"
            style={{
              background: 'rgba(30, 41, 59, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '50%',
              color: '#94a3b8',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* Head Touch/Rub Interactive Hotspot */}
        <div 
          className="astra-head-zone"
          onClick={handleHeadPoke}
          onMouseMove={handleHeadRub}
          title="Click to poke, rub back-and-forth for head rub!"
          style={{
            position: 'absolute',
            top: '15px',
            width: '80px',
            height: '65px',
            borderRadius: '50%',
            zIndex: 5,
            cursor: 'pointer'
          }}
        />

        {/* Mascot GIF image */}
        <img 
          src={currentGif} 
          alt="Astra Companion" 
          onError={(e) => {
            console.warn("Astra GIF failed to load, falling back to idle:", e.target.src);
            e.target.src = '/astra_gifs/idle.gif';
          }}
          style={{
            width: '135px',
            height: '135px',
            objectFit: 'contain',
            pointerEvents: 'none',
            borderRadius: '16px'
          }}
        />
      </div>

      {/* Mascot Name Badge */}
      <div style={{
        marginTop: '-6px',
        background: 'linear-gradient(135deg, #0ea5e9, #10b981)',
        color: '#fff',
        padding: '2px 10px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.5px',
        boxShadow: '0 2px 8px rgba(14, 165, 233, 0.4)',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }}>
        <Sparkles size={11} /> Astra
      </div>
    </div>
  );
}
