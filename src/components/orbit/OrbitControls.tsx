import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Compass, Layers } from 'lucide-react';
import { useOrbitStore } from '../../stores/orbitStore';

interface OrbitControlsProps {
  onExit: () => void;
  onToggleConstellation: () => void;
  showOnboarding?: boolean;
}

export default function OrbitControls({
  onExit,
  onToggleConstellation,
  showOnboarding = false,
}: OrbitControlsProps) {
  const { history, historyIndex, showConstellation } = useOrbitStore();
  
  const sessionDepth = history.length;
  const canGoBack = historyIndex > 0;

  return (
    <>
      {/* Top controls bar */}
      <div className="absolute top-0 left-0 right-0 z-50 p-4 flex items-center justify-between">
        {/* Exit button */}
        <motion.button
          onClick={onExit}
          className="p-3 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:bg-black/70 transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <X size={20} />
        </motion.button>

        {/* Session info */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          {/* History indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10">
            <Compass className="w-4 h-4 text-purple-400" />
            <span className="text-white/70 text-sm font-medium">
              {sessionDepth} {sessionDepth === 1 ? 'film' : 'films'}
            </span>
          </div>

          {/* Constellation toggle */}
          <motion.button
            onClick={onToggleConstellation}
            className={`p-3 rounded-full backdrop-blur-md border transition-colors ${
              showConstellation
                ? 'bg-purple-500/50 border-purple-400/50 text-white'
                : 'bg-black/50 border-white/10 text-white/70 hover:text-white hover:bg-black/70'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Layers size={20} />
          </motion.button>
        </motion.div>
      </div>

      {/* Bottom hint bar */}
      <div className="absolute bottom-0 left-0 right-0 z-50 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
        >
          {canGoBack && (
            <div className="px-4 py-2 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white/50 text-sm">
              Swipe right to go back
            </div>
          )}
        </motion.div>
      </div>

      {/* First-time onboarding overlay */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-sm mx-4 p-6 rounded-2xl bg-gradient-to-br from-gray-900 to-black border border-white/10"
            >
              <h3 className="text-xl font-bold text-white mb-4 text-center">
                The Cinephile Compass
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <ChevronLeft className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Swipe Left</p>
                    <p className="text-white/50 text-sm">Vibe Match - Similar mood & feel</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <ChevronRight className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Swipe Right</p>
                    <p className="text-white/50 text-sm">Breadcrumb - Go back in history</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-amber-500/20">
                    <ChevronUp className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Swipe Up</p>
                    <p className="text-white/50 text-sm">Auteur Match - Same director/writer</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-pink-500/20">
                    <ChevronDown className="w-6 h-6 text-pink-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Swipe Down</p>
                    <p className="text-white/50 text-sm">Aesthetic Match - Visual style</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 text-center">
                <p className="text-white/40 text-sm">
                  Hold on any movie to save it • Pinch to see your constellation
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

