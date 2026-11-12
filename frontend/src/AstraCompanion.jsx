import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Volume2, VolumeX, Minimize2, Send } from 'lucide-react';

/**
 * Clean speech input by stripping emojis, code symbols and excessive formatting
 */
const cleanForSpeech = (rawText) => {
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

const speakAstra = (text, isMuted, onStart, onEnd) => {
  if (isMuted || !window.speechSynthesis) {
    if (onEnd) onEnd();
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const cleanText = cleanForSpeech(text);
    if (!cleanText) {
      if (onEnd) onEnd();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Cute, friendly mascot parameters: higher pitch, calm cadence
    utterance.pitch = 1.35;
    utterance.rate = 0.90;
    utterance.volume = 0.95;

    const voices = window.speechSynthesis.getVoices();
    const cuteVoice = voices.find(v => 
      v.lang.startsWith('en') && (
        v.name.includes('Samantha') || 
        v.name.includes('Victoria') || 
        v.name.includes('Zira') ||
        v.name.includes('Jenny') ||
        v.name.includes('Google UK English Female') ||
        v.name.includes('Google US English') ||
        v.name.toLowerCase().includes('female')
      )
    ) || voices.find(v => v.lang.startsWith('en'));

    if (cuteVoice) utterance.voice = cuteVoice;

    if (onStart) utterance.onstart = onStart;
    if (onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
    }

    window.speechSynthesis.speak(utterance);
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
        setSpeechBubble("Answering... 💬");
      }
    } else {
      // Completed streaming
      if (animState === 'speaking' || animState === 'thinking') {
        if (isAstraOnly && latestReply) {
          // In Astra-Only mode, set speaking animation while speaking the reply out loud!
          setAnimState('speaking');
          setSpeechBubble(latestReply.slice(0, 160) + (latestReply.length > 160 ? '...' : ''));
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
    if (now - lastMoveTimeRef.current < 70) return;
    lastMoveTimeRef.current = now;
    mouseMoveCountRef.current += 1;

    // Wake up if sleeping on touch rub
    if (animState === 'sleeping' || animState === 'sleep_begin') {
      wakeUpThen('idle', "Astra is up and ready! 🌟");
      return;
    }

    if (mouseMoveCountRef.current > 3 && animState !== 'rubbing' && animState !== 'entry') {
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

  const handleTouchMove = (e) => {
    // Prevent mobile pull-to-refresh or accidental scrolling while rubbing Astra
    if (e.cancelable) e.preventDefault();
    handleHeadRub(e);
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
        className="astra-only-backdrop"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 99999,
          background: 'radial-gradient(circle at 50% 40%, #0d1e33 0%, #060b14 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          userSelect: 'none'
        }}
      >
        {/* Top Control Header */}
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          left: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          zIndex: 20
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#38bdf8',
              boxShadow: '0 0 10px #38bdf8'
            }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#e0f2fe', letterSpacing: '0.5px' }}>
              ASTRA
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => {
                const nextMuted = !isMuted;
                setIsMuted(nextMuted);
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                if (!nextMuted) speakAstra("Voice enabled!", false);
              }}
              title={isMuted ? "Unmute Voice" : "Mute Voice"}
              style={{
                background: isMuted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(14, 165, 233, 0.2)',
                border: `1px solid ${isMuted ? '#ef4444' : '#0ea5e9'}`,
                color: isMuted ? '#ef4444' : '#38bdf8',
                borderRadius: '20px',
                padding: '6px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 600,
                backdropFilter: 'blur(10px)'
              }}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              <span>{isMuted ? 'Muted' : 'Voice'}</span>
            </button>

            <button
              onClick={() => {
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                onExitAstraOnly();
              }}
              title="Exit Astra Only mode and return to Chat"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#fff',
                borderRadius: '20px',
                padding: '6px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 600,
                backdropFilter: 'blur(10px)'
              }}
            >
              <Minimize2 size={14} />
              <span>Chat View</span>
            </button>
          </div>
        </div>

        {/* Center Big Astra Mascot & Speech */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '92vw',
          padding: '0 12px',
          margin: 'auto',
          textAlign: 'center'
        }}>
          {/* Large Dynamic Speech Bubble */}
          {speechBubble && (
            <div style={{
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              borderRadius: '20px',
              padding: '10px 18px',
              fontSize: '14px',
              lineHeight: 1.45,
              fontWeight: 500,
              color: '#e0f2fe',
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0, 180, 255, 0.25)',
              backdropFilter: 'blur(16px)',
              marginBottom: '16px',
              animation: 'fadeIn 0.3s ease',
              maxHeight: '130px',
              maxWidth: '85vw',
              overflowY: 'auto'
            }}>
              {speechBubble}
            </div>
          )}

          {/* Big Mascot Frame */}
          <div 
            onClick={handleWidgetClick}
            style={{
              position: 'relative',
              width: 'min(68vw, 280px)',
              height: 'min(68vw, 280px)',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(14, 165, 233, 0.18) 0%, rgba(16, 185, 129, 0.08) 60%, transparent 80%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 60px rgba(14, 165, 233, 0.25)',
              userSelect: 'none',
              touchAction: 'none'
            }}
          >
            {/* Interactive head touch zone with native touch & mouse support */}
            <div 
              className="astra-head-zone"
              onClick={handleHeadPoke}
              onMouseMove={handleHeadRub}
              onTouchMove={handleTouchMove}
              onTouchStart={(e) => {
                lastMoveTimeRef.current = Date.now();
                mouseMoveCountRef.current = 0;
              }}
              title="Poke or rub Astra's head!"
              style={{
                position: 'absolute',
                top: '15px',
                width: '75%',
                height: '60%',
                borderRadius: '50%',
                zIndex: 25,
                cursor: 'pointer',
                touchAction: 'none',
                WebkitTapHighlightColor: 'transparent',
                userSelect: 'none'
              }}
            />

            <img 
              src={currentGif} 
              alt="Astra Companion" 
              draggable={false}
              onError={(e) => {
                console.warn("Astra GIF failed to load, falling back to idle:", e.target.src);
                e.target.src = '/astra_gifs/idle.gif';
              }}
              style={{
                width: '90%',
                height: '90%',
                objectFit: 'contain',
                pointerEvents: 'none',
                userSelect: 'none',
                WebkitUserDrag: 'none',
                filter: 'drop-shadow(0 10px 24px rgba(0, 240, 255, 0.4))'
              }}
            />
          </div>

          <div style={{
            marginTop: '12px',
            fontSize: '11.5px',
            color: '#64748b',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            fontWeight: 600,
            padding: '0 10px'
          }}>
            {animState === 'sleeping' ? '😴 Astra is napping (type below to wake)' : '✨ Tap head to poke • Rub to pet'}
          </div>
        </div>

        {/* Bottom Clean Chat Input */}
        <div style={{
          position: 'absolute',
          bottom: '16px',
          width: '100%',
          maxWidth: '680px',
          padding: '0 16px calc(env(safe-area-inset-bottom, 0px) + 8px)',
          display: 'flex',
          gap: '8px'
        }}>
          <div style={{
            position: 'relative',
            flex: 1,
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '28px',
            padding: '6px 16px',
            display: 'flex',
            alignItems: 'center',
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(12px)'
          }}>
            <input 
              type="text"
              placeholder="Talk with Astra... (Speaks replies out loud ✨)"
              value={localInput}
              onChange={(e) => setLocalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && localInput.trim() && !isStreaming) {
                  const query = localInput.trim();
                  setLocalInput('');
                  onSendMessage(query);
                }
              }}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '16px',
                padding: '10px 6px'
              }}
            />
            <button
              onClick={() => {
                if (localInput.trim() && !isStreaming) {
                  const query = localInput.trim();
                  setLocalInput('');
                  onSendMessage(query);
                }
              }}
              disabled={!localInput.trim() || isStreaming}
              style={{
                background: localInput.trim() ? 'linear-gradient(135deg, #0ea5e9, #10b981)' : 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: localInput.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease'
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
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
