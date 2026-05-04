
import React, { useState, useEffect, useMemo } from 'react';

interface ResultRevealOverlayProps {
  gameName: string;
  winningNumber: string;
  onClose: () => void;
}

const TENSION_PHRASES = [
    "INITIATING QUANTUM DRAW...",
    "COLLECTING ALL ENTRIES...",
    "HARNESSING COSMIC LUCK...",
    "STABILIZING ODDS...",
    "FINALIZING JACKPOT PATH...",
    "THE ORACLE IS SPEAKING...",
    "BRACING FOR IMPACT...",
    "LOCKING IN THE WINNER..."
];

const Confetti: React.FC = () => {
    const pieces = useMemo(() => {
        return Array.from({ length: 80 }).map((_, i) => ({
            left: Math.random() * 100 + '%',
            delay: Math.random() * 3 + 's',
            duration: Math.random() * 2 + 2 + 's',
            color: ['#fbbf24', '#fcd34d', '#ec4899', '#06b6d4', '#8b5cf6', '#ffffff'][Math.floor(Math.random() * 6)],
            size: Math.random() * 12 + 6 + 'px',
            rotation: Math.random() * 360 + 'deg'
        }));
    }, []);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-50">
            {pieces.map((p, i) => (
                <div 
                    key={i} 
                    className="confetti-piece" 
                    style={{ 
                        left: p.left, 
                        animationDelay: p.delay, 
                        animationDuration: p.duration,
                        backgroundColor: p.color,
                        width: p.size,
                        height: p.size,
                        transform: `rotate(${p.rotation})`,
                        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                        boxShadow: `0 0 10px ${p.color}`
                    }} 
                />
            ))}
        </div>
    );
};

const ResultRevealOverlay: React.FC<ResultRevealOverlayProps> = ({ gameName, winningNumber, onClose }) => {
  const [phase, setPhase] = useState<'ROLLING' | 'REVEAL'>('ROLLING');
  const [displayNum, setDisplayNum] = useState('00');
  const [isShaking, setIsShaking] = useState(false);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [showFlash, setShowFlash] = useState(false);

  const TOTAL_ROLL_TIME = 7000; // 7 seconds for good tension without boredom

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    let phraseInterval: ReturnType<typeof setInterval>;
    let progressInterval: ReturnType<typeof setInterval>;

    if (phase === 'ROLLING') {
      interval = setInterval(() => {
        const randomNum = winningNumber.length === 1 
          ? Math.floor(Math.random() * 10).toString()
          : Math.floor(Math.random() * 100).toString().padStart(2, '0');
        setDisplayNum(randomNum);
      }, 40);

      phraseInterval = setInterval(() => {
        setPhraseIndex(prev => (prev + 1) % TENSION_PHRASES.length);
      }, 6000);

      progressInterval = setInterval(() => {
        setElapsed(prev => prev + 100);
      }, 100);

      const timer = setTimeout(() => {
        setShowFlash(true);
        setTimeout(() => {
            setPhase('REVEAL');
            setDisplayNum(winningNumber);
            setIsShaking(true);
            setShowFlash(false);
            setTimeout(() => setIsShaking(false), 800);
        }, 150);
      }, TOTAL_ROLL_TIME);

      return () => {
        clearInterval(interval);
        clearInterval(phraseInterval);
        clearInterval(progressInterval);
        clearTimeout(timer);
      };
    }
  }, [phase, winningNumber]);

  const intensity = elapsed / TOTAL_ROLL_TIME;

  return (
    <div className={`fixed inset-0 z-[1000] flex flex-col items-center overflow-y-auto overflow-x-hidden bg-slate-950 transition-all duration-1000 py-10 md:justify-center ${isShaking ? 'animate-shake scale-105' : ''}`}>
      
      {/* Background Prismatic Effects */}
      <div className="fixed inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
        {/* Prismatic Rotating Beams */}
        <div 
            className="w-[300vw] h-[300vw] opacity-40 animate-spotlight"
            style={{ 
                animationDuration: `${12 - (intensity * 10)}s`,
                background: `conic-gradient(from 0deg, 
                    transparent 0deg, 
                    rgba(6,182,212,0.3) 20deg, 
                    transparent 40deg, 
                    rgba(236,72,153,0.3) 60deg, 
                    transparent 80deg, 
                    rgba(251,191,36,0.3) 100deg, 
                    transparent 120deg)`
            }}
        ></div>
        
        {/* Pulse Aura */}
        <div className={`absolute inset-0 transition-colors duration-1000 ${intensity > 0.8 ? 'bg-orange-500/10' : 'bg-cyan-500/5'}`}></div>
        
        {/* Space Dust Particles */}
        <div className="absolute inset-0">
            {Array.from({ length: 30 }).map((_, i) => (
                <div 
                    key={i} 
                    className="absolute bg-white rounded-full opacity-20 animate-pulse"
                    style={{
                        width: Math.random() * 4 + 'px',
                        height: Math.random() * 4 + 'px',
                        left: Math.random() * 100 + '%',
                        top: Math.random() * 100 + '%',
                        animationDuration: Math.random() * 3 + 1 + 's',
                        animationDelay: Math.random() * 2 + 's'
                    }}
                ></div>
            ))}
        </div>
      </div>

      {/* Impact Flash */}
      {showFlash && <div className="fixed inset-0 bg-white z-[1100]"></div>}

      {phase === 'REVEAL' && <Confetti />}

      <div className="relative z-[1010] text-center px-4 w-full max-w-4xl flex flex-col items-center">
        {/* Animated Progress Header */}
        <div className="mb-8 md:mb-12 w-full">
            <h2 className={`text-lg md:text-3xl font-black tracking-[0.5em] uppercase transition-all duration-1000 ${phase === 'REVEAL' ? 'text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.8)]' : 'text-white/80'}`}>
                {phase === 'REVEAL' ? '✨ DRAW FINALIZED ✨' : TENSION_PHRASES[phraseIndex]}
            </h2>
            <div className="h-1 w-48 md:h-1.5 md:w-96 mx-auto mt-4 bg-slate-800 rounded-full overflow-hidden border border-white/10">
                <div 
                    className={`h-full transition-all duration-100 ease-linear ${intensity > 0.8 ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-cyan-500 to-blue-500'}`} 
                    style={{ width: phase === 'REVEAL' ? '100%' : `${intensity * 100}%` }}
                ></div>
            </div>
        </div>

        <h1 className={`text-4xl md:text-9xl font-black uppercase tracking-tighter mb-8 md:mb-12 transition-all duration-1000 ${phase === 'REVEAL' ? 'text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 scale-110' : 'text-slate-700'}`}>
          {gameName}
        </h1>

        {/* The 3D Liquid Metal Ball */}
        <div className="relative inline-block group">
            {/* Massive Outer Glow */}
            <div className={`absolute -inset-10 md:-inset-20 rounded-full blur-[60px] md:blur-[100px] transition-all duration-1000 ${phase === 'REVEAL' ? 'bg-amber-500/50 scale-125' : intensity > 0.8 ? 'bg-orange-600/30 animate-pulse' : 'bg-cyan-500/20'}`}></div>
            
            {/* The Orb */}
            <div className={`
                w-48 h-48 md:w-96 md:h-96 rounded-full border-[10px] md:border-[16px] relative flex items-center justify-center transition-all duration-1000 overflow-hidden
                ${phase === 'REVEAL' 
                    ? 'border-amber-400 bg-gradient-to-br from-slate-800 via-slate-900 to-black shadow-[0_0_60px_rgba(251,191,36,0.6)] md:shadow-[0_0_100px_rgba(251,191,36,0.8)]' 
                    : intensity > 0.8 
                    ? 'border-orange-500 bg-slate-900 shadow-[0_0_50px_rgba(249,115,22,0.4)]'
                    : 'border-slate-700 bg-slate-900 shadow-[0_0_40px_rgba(6,182,212,0.2)]'}
            `}>
                {/* Surface Reflections */}
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.15)_0%,transparent_50%)]"></div>
                <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_70%_70%,rgba(0,0,0,0.4)_0%,transparent_50%)]"></div>
                
                {/* Rolling Number */}
                <div className={`
                    text-[6rem] md:text-[14rem] font-black font-mono tracking-tighter transition-all duration-300
                    ${phase === 'REVEAL' ? 'text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.8)]' : 'text-cyan-400/40'}
                `}>
                    {displayNum}
                </div>
                
                {/* Internal Energy Ring */}
                <div className={`absolute inset-4 border-4 border-dashed rounded-full opacity-20 ${phase === 'REVEAL' ? 'animate-[spin_4s_linear_infinite] border-amber-400' : 'animate-[spin_10s_linear_infinite] border-cyan-400'}`}></div>
            </div>

            {/* Orbiting Sparks */}
            {phase === 'REVEAL' && (
                <>
                    <div className="absolute -inset-6 md:-inset-12 border-2 border-white/20 rounded-full animate-ping"></div>
                    <div className="absolute -inset-12 md:-inset-24 border border-amber-400/20 rounded-full animate-[ping_2s_linear_infinite]"></div>
                </>
            )}
        </div>

        {/* Victory/Status Message with CONTINUE button */}
        <div className="mt-12 md:mt-16 h-auto min-h-[12rem] flex flex-col items-center justify-center z-[1200]">
          {phase === 'REVEAL' ? (
            <div className="animate-reveal-slam-intense flex flex-col items-center">
              <div className="text-3xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-white to-amber-300 uppercase italic tracking-[0.2em] mb-6 md:mb-8 text-center">
                JACKPOT REVEALED
              </div>
              <button 
                onClick={onClose}
                className="group relative px-10 py-4 md:px-20 md:py-5 rounded-full overflow-hidden transition-all transform hover:scale-110 active:scale-95 shadow-[0_0_50px_rgba(255,255,255,0.4)] bg-white border-4 border-amber-400"
              >
                <span className="relative z-10 text-slate-950 font-black text-lg md:text-2xl tracking-[0.2em]">CONTINUE</span>
                <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-500 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500"></div>
              </button>
              <p className="mt-6 text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest animate-pulse">Click to return to dashboard</p>
            </div>
          ) : (
            <div className="space-y-6">
                <div className="flex gap-4 justify-center">
                    <div className={`w-3 h-3 md:w-4 md:h-4 rounded-full animate-bounce ${intensity > 0.8 ? 'bg-orange-500 shadow-[0_0_15px_#f97316]' : 'bg-cyan-500 shadow-[0_0_15px_#06b6d4]'}`} style={{animationDelay: '0s'}}></div>
                    <div className={`w-3 h-3 md:w-4 md:h-4 rounded-full animate-bounce ${intensity > 0.8 ? 'bg-orange-500 shadow-[0_0_15px_#f97316]' : 'bg-cyan-500 shadow-[0_0_15px_#06b6d4]'}`} style={{animationDelay: '0.2s'}}></div>
                    <div className={`w-3 h-3 md:w-4 md:h-4 rounded-full animate-bounce ${intensity > 0.8 ? 'bg-orange-500 shadow-[0_0_15px_#f97316]' : 'bg-cyan-500 shadow-[0_0_15px_#06b6d4]'}`} style={{animationDelay: '0.4s'}}></div>
                </div>
                <div className="text-white/40 text-[10px] md:text-sm font-mono uppercase tracking-[0.5em]">
                    Synchronizing Satellite Data... {(intensity * 100).toFixed(1)}%
                </div>
            </div>
          )}
        </div>
      </div>

      {/* Decorative Corner Borders - Hidden on very small screens to save space */}
      <div className={`hidden sm:block absolute top-12 left-12 w-24 h-24 border-t-8 border-l-8 rounded-tl-3xl transition-colors duration-1000 ${phase === 'REVEAL' ? 'border-amber-400' : 'border-white/10'}`}></div>
      <div className={`hidden sm:block absolute top-12 right-12 w-24 h-24 border-t-8 border-r-8 rounded-tr-3xl transition-colors duration-1000 ${phase === 'REVEAL' ? 'border-amber-400' : 'border-white/10'}`}></div>
      <div className={`hidden sm:block absolute bottom-12 left-12 w-24 h-24 border-b-8 border-l-8 rounded-bl-3xl transition-colors duration-1000 ${phase === 'REVEAL' ? 'border-amber-400' : 'border-white/10'}`}></div>
      <div className={`hidden sm:block absolute bottom-12 right-12 w-24 h-24 border-b-8 border-r-8 rounded-br-3xl transition-colors duration-1000 ${phase === 'REVEAL' ? 'border-amber-400' : 'border-white/10'}`}></div>
    </div>
  );
};

export default ResultRevealOverlay;
