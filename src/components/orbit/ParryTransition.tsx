import { motion, AnimatePresence, type Variants, type Transition } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { SwipeDirection } from '../../stores/orbitStore';

interface ParryTransitionProps {
  isActive: boolean;
  targetColor: string;
  direction: SwipeDirection | null;
  onComplete?: () => void;
}

// Type-safe easing
const easeOutQuad: Transition['ease'] = [0.25, 0.46, 0.45, 0.94];

// Glass shatter effect variants
const shatterVariants: Variants = {
  initial: (direction: SwipeDirection | null) => ({
    opacity: 0,
    scale: 0.8,
    x: direction === 'left' ? 100 : direction === 'right' ? -100 : 0,
    y: direction === 'up' ? 100 : direction === 'down' ? -100 : 0,
  }),
  animate: {
    opacity: 1,
    scale: 1,
    x: 0,
    y: 0,
    transition: {
      duration: 0.3,
      ease: easeOutQuad,
    },
  },
  exit: (direction: SwipeDirection | null) => ({
    opacity: 0,
    scale: 1.1,
    x: direction === 'left' ? -100 : direction === 'right' ? 100 : 0,
    y: direction === 'up' ? -100 : direction === 'down' ? 100 : 0,
    transition: {
      duration: 0.2,
      ease: 'easeIn' as const,
    },
  }),
};

// Warp blur ring effect
const warpRingVariants: Variants = {
  initial: {
    scale: 0,
    opacity: 1,
  },
  animate: {
    scale: 3,
    opacity: 0,
    transition: {
      duration: 0.6,
      ease: 'easeOut' as const,
    },
  },
};

// Particle burst effect
const particleVariants: Variants = {
  initial: () => ({
    x: 0,
    y: 0,
    opacity: 1,
    scale: 1,
  }),
  animate: (i: number) => {
    const angle = (i / 8) * Math.PI * 2;
    const distance = 150 + Math.random() * 100;
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      opacity: 0,
      scale: 0,
      transition: {
        duration: 0.5,
        ease: 'easeOut' as const,
        delay: i * 0.02,
      },
    };
  },
};

export default function ParryTransition({
  isActive,
  targetColor,
  direction,
  onComplete,
}: ParryTransitionProps) {
  const [showParticles, setShowParticles] = useState(false);

  useEffect(() => {
    if (isActive) {
      setShowParticles(true);
      const timer = setTimeout(() => {
        setShowParticles(false);
        onComplete?.();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isActive, onComplete]);

  // Generate lighter and darker shades
  const lighterColor = adjustBrightness(targetColor, 30);
  const darkerColor = adjustBrightness(targetColor, -30);

  return (
    <AnimatePresence mode="wait">
      {isActive && (
        <motion.div
          key={targetColor}
          className="fixed inset-0 z-40 pointer-events-none overflow-hidden"
          custom={direction}
          variants={shatterVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {/* Main color fill */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at center, ${lighterColor} 0%, ${targetColor} 50%, ${darkerColor} 100%)`,
            }}
          />

          {/* Warp rings */}
          <div className="absolute inset-0 flex items-center justify-center">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border-2"
                style={{
                  width: 100,
                  height: 100,
                  borderColor: `${lighterColor}40`,
                }}
                variants={warpRingVariants}
                initial="initial"
                animate="animate"
                transition={{ delay: i * 0.1 }}
              />
            ))}
          </div>

          {/* Particle burst */}
          {showParticles && (
            <div className="absolute inset-0 flex items-center justify-center">
              {Array.from({ length: 8 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-3 h-3 rounded-full"
                  style={{ backgroundColor: lighterColor }}
                  custom={i}
                  variants={particleVariants}
                  initial="initial"
                  animate="animate"
                />
              ))}
            </div>
          )}

          {/* Direction indicator arrow */}
          {direction && direction !== 'right' && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 2 }}
              animate={{ opacity: [0, 1, 0], scale: [2, 1, 0.8] }}
              transition={{ duration: 0.4 }}
            >
              <div
                className="text-white/30 font-bold text-6xl"
                style={{ textShadow: `0 0 40px ${lighterColor}` }}
              >
                {direction === 'left' && '←'}
                {direction === 'up' && '↑'}
                {direction === 'down' && '↓'}
              </div>
            </motion.div>
          )}

          {/* Scan line effect */}
          <motion.div
            className="absolute left-0 right-0 h-px"
            style={{ backgroundColor: `${lighterColor}60` }}
            initial={{ top: '-10%' }}
            animate={{ top: '110%' }}
            transition={{ duration: 0.5, ease: 'linear' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Helper function to adjust brightness of hex color
function adjustBrightness(hex: string, percent: number): string {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Parse RGB
  let r = parseInt(hex.slice(0, 2), 16);
  let g = parseInt(hex.slice(2, 4), 16);
  let b = parseInt(hex.slice(4, 6), 16);

  // Adjust brightness
  r = Math.min(255, Math.max(0, r + (r * percent) / 100));
  g = Math.min(255, Math.max(0, g + (g * percent) / 100));
  b = Math.min(255, Math.max(0, b + (b * percent) / 100));

  // Convert back to hex
  return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
}

