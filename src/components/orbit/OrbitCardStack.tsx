import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate, type PanInfo } from 'framer-motion';
import { useOrbitStore, type SwipeDirection } from '../../stores/orbitStore';
import OrbitCard from './OrbitCard';

interface OrbitCardStackProps {
  onSwipe: (direction: SwipeDirection) => void;
  onLongPress: () => void;
  isTransitioning: boolean;
}

const SWIPE_THRESHOLD = 0.3; // 30% of screen
const LONG_PRESS_DURATION = 500; // ms
type TimeoutId = ReturnType<typeof setTimeout>;

export default function OrbitCardStack({
  onSwipe,
  onLongPress,
  isTransitioning,
}: OrbitCardStackProps) {
  const { currentMovie, history, historyIndex } = useOrbitStore();
  
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const [isDragging, setIsDragging] = useState(false);
  const [swipeHint, setSwipeHint] = useState<SwipeDirection | null>(null);
  const longPressTimer = useRef<TimeoutId | null>(null);
  const dragStartTime = useRef<number>(0);
  
  // Calculate rotation based on drag
  const rotateX = useTransform(y, [-200, 200], [10, -10]);
  const rotateY = useTransform(x, [-200, 200], [-10, 10]);
  
  // Opacity hints for direction
  const leftHintOpacity = useTransform(x, [-100, 0], [1, 0]);
  const rightHintOpacity = useTransform(x, [0, 100], [0, 1]);
  const upHintOpacity = useTransform(y, [-100, 0], [1, 0]);
  const downHintOpacity = useTransform(y, [0, 100], [0, 1]);

  const currentNode = history[historyIndex];
  const isSaved = currentNode?.saved || false;

  // Determine swipe direction from offset
  const getSwipeDirection = (offsetX: number, offsetY: number): SwipeDirection | null => {
    const threshold = Math.min(window.innerWidth, window.innerHeight) * SWIPE_THRESHOLD;
    
    if (Math.abs(offsetX) > Math.abs(offsetY)) {
      if (offsetX < -threshold) return 'left';
      if (offsetX > threshold) return 'right';
    } else {
      if (offsetY < -threshold) return 'up';
      if (offsetY > threshold) return 'down';
    }
    
    return null;
  };

  // Handle drag start
  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    dragStartTime.current = Date.now();
    
    // Start long press timer
    longPressTimer.current = setTimeout(() => {
      if (isDragging) {
        onLongPress();
        // Provide feedback - subtle pulse animation
        animate(x, [0, -5, 5, -5, 5, 0], { duration: 0.3 });
      }
    }, LONG_PRESS_DURATION);
  }, [onLongPress, isDragging, x]);

  // Handle drag
  const handleDrag = useCallback((_: any, info: PanInfo) => {
    // Cancel long press if user moves too much
    if (Math.abs(info.offset.x) > 20 || Math.abs(info.offset.y) > 20) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
    
    // Update swipe hint
    const direction = getSwipeDirection(info.offset.x, info.offset.y);
    setSwipeHint(direction);
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    setIsDragging(false);
    setSwipeHint(null);
    
    // Clear long press timer
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    const direction = getSwipeDirection(info.offset.x, info.offset.y);
    
    if (direction && !isTransitioning) {
      // Animate card off screen
      const exitX = direction === 'left' ? -window.innerWidth : direction === 'right' ? window.innerWidth : 0;
      const exitY = direction === 'up' ? -window.innerHeight : direction === 'down' ? window.innerHeight : 0;
      
      animate(x, exitX, { duration: 0.3 });
      animate(y, exitY, { duration: 0.3 });
      
      // Trigger swipe action after animation starts
      setTimeout(() => {
        onSwipe(direction);
        // Reset position for next card
        x.set(0);
        y.set(0);
      }, 150);
    } else {
      // Spring back to center
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 });
      animate(y, 0, { type: 'spring', stiffness: 500, damping: 30 });
    }
  }, [isTransitioning, onSwipe, x, y]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  if (!currentMovie) return null;

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Direction hint overlays */}
      <motion.div
        className="absolute left-0 top-0 bottom-0 w-24 pointer-events-none"
        style={{
          opacity: leftHintOpacity,
          background: 'linear-gradient(to right, rgba(139, 92, 246, 0.3), transparent)',
        }}
      >
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400 font-bold text-sm uppercase tracking-wider -rotate-90">
          Vibe
        </div>
      </motion.div>
      
      <motion.div
        className="absolute right-0 top-0 bottom-0 w-24 pointer-events-none"
        style={{
          opacity: rightHintOpacity,
          background: 'linear-gradient(to left, rgba(59, 130, 246, 0.3), transparent)',
        }}
      >
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-400 font-bold text-sm uppercase tracking-wider rotate-90">
          Back
        </div>
      </motion.div>
      
      <motion.div
        className="absolute top-0 left-0 right-0 h-24 pointer-events-none"
        style={{
          opacity: upHintOpacity,
          background: 'linear-gradient(to bottom, rgba(245, 158, 11, 0.3), transparent)',
        }}
      >
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-amber-400 font-bold text-sm uppercase tracking-wider">
          Auteur
        </div>
      </motion.div>
      
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
        style={{
          opacity: downHintOpacity,
          background: 'linear-gradient(to top, rgba(236, 72, 153, 0.3), transparent)',
        }}
      >
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-pink-400 font-bold text-sm uppercase tracking-wider">
          Aesthetic
        </div>
      </motion.div>

      {/* Main card */}
      <motion.div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{
          x,
          y,
          rotateX,
          rotateY,
          transformPerspective: 1000,
        }}
        drag={!isTransitioning}
        dragElastic={0.1}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
      >
        <OrbitCard
          movie={currentMovie}
          isSaved={isSaved}
          connectionReason={historyIndex > 0 ? undefined : undefined} // Could show connection reason here
          onSaveToggle={() => {}}
          isActive={!isTransitioning}
        />
      </motion.div>

      {/* Swipe direction indicator */}
      {swipeHint && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
        >
          <div className={`
            px-6 py-3 rounded-full font-bold text-lg uppercase tracking-wider backdrop-blur-md
            ${swipeHint === 'left' ? 'bg-purple-500/80 text-white' : ''}
            ${swipeHint === 'right' ? 'bg-blue-500/80 text-white' : ''}
            ${swipeHint === 'up' ? 'bg-amber-500/80 text-white' : ''}
            ${swipeHint === 'down' ? 'bg-pink-500/80 text-white' : ''}
          `}>
            {swipeHint === 'left' && 'Vibe Match'}
            {swipeHint === 'right' && 'Go Back'}
            {swipeHint === 'up' && 'Auteur Match'}
            {swipeHint === 'down' && 'Aesthetic Match'}
          </div>
        </motion.div>
      )}
    </div>
  );
}

