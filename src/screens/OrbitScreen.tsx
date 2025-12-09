import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { usePinchGesture } from '../hooks/usePinchGesture';
import { useOrbitStore, type SwipeDirection, type OrbitMovie } from '../stores/orbitStore';
import { getNextMovie, prefetchNextMoves, extractDominantColor } from '../lib/orbitEngine';
import { orbitHaptics } from '../lib/haptics';
import OrbitCardStack from '../components/orbit/OrbitCardStack';
import OrbitControls from '../components/orbit/OrbitControls';
import ParryTransition from '../components/orbit/ParryTransition';
import ConstellationView from '../components/orbit/ConstellationView';

const TMDB_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TMDB_API_KEY) ||
  '087e509f6f93e629488a550f1451bb76';

export default function OrbitScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  
  const {
    currentMovie,
    showConstellation,
    isTransitioning,
    pendingDirection,
    prefetchedMoves,
    enterOrbit,
    exitOrbit,
    navigateTo,
    goBack,
    toggleSaved,
    setTransitioning,
    setShowConstellation,
    setPendingDirection,
    setPrefetchedMoves,
  } = useOrbitStore();

  const [isLoading, setIsLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [transitionColor, setTransitionColor] = useState('#1a1a2e');
  const [movieContext, setMovieContext] = useState<{ cinematographer?: string; writer?: string; visualStyle?: string } | null>(null);
  
  // Pinch gesture for constellation toggle
  const containerRef = useRef<HTMLDivElement>(null);
  usePinchGesture(containerRef, {
    onPinchIn: () => {
      if (!showConstellation) {
        setShowConstellation(true);
        orbitHaptics.swipeComplete();
      }
    },
    onPinchOut: () => {
      if (showConstellation) {
        setShowConstellation(false);
        orbitHaptics.swipeComplete();
      }
    },
    threshold: 0.25,
    enabled: !isTransitioning && !isLoading,
  });

  // Initialize orbit with movie data
  useEffect(() => {
    const initOrbit = async () => {
      if (!id) {
        navigate('/app');
        return;
      }

      const movieId = parseInt(id);
      
      try {
        // Fetch movie details from TMDB
        const response = await fetch(
          `https://api.themoviedb.org/3/movie/${movieId}?api_key=${TMDB_API_KEY}&append_to_response=credits`
        );
        
        if (!response.ok) throw new Error('Failed to fetch movie');
        
        const data = await response.json();
        
        // Extract director
        const director = data.credits?.crew?.find((c: any) => c.job === 'Director')?.name;
        const cinematographer = data.credits?.crew?.find((c: any) => c.job === 'Director of Photography')?.name;
        
        // Get dominant color from poster
        const posterUrl = data.poster_path 
          ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
          : null;
        
        let dominantHex = '#1a1a2e';
        if (posterUrl) {
          dominantHex = await extractDominantColor(posterUrl);
        }
        
        const entryMovie: OrbitMovie = {
          id: data.id,
          title: data.title,
          year: data.release_date?.slice(0, 4) || '----',
          posterPath: data.poster_path,
          backdropPath: data.backdrop_path,
          dominantHex,
          mediaType: 'movie',
          director,
          cinematographer,
          genres: data.genres?.map((g: any) => g.name) || [],
        };
        
        enterOrbit(entryMovie);
        setTransitionColor(dominantHex);
        
        // Store context for future queries
        setMovieContext({ cinematographer, writer: undefined, visualStyle: undefined });
        
        // Check if first time user
        const hasSeenOnboarding = localStorage.getItem('orbit_onboarding_seen');
        if (!hasSeenOnboarding) {
          setShowOnboarding(true);
          localStorage.setItem('orbit_onboarding_seen', 'true');
        }
        
        setIsLoading(false);
        
        // Pre-fetch next moves in background
        prefetchNextMoves(entryMovie, { cinematographer }).then((moves) => {
          setPrefetchedMoves({
            vibe: moves.vibe || null,
            aesthetic: moves.aesthetic || null,
            auteur: moves.auteur || null,
          });
        });
        
      } catch (error) {
        console.error('Failed to initialize orbit:', error);
        navigate('/app');
      }
    };

    initOrbit();
    
    return () => {
      // Don't exit orbit on unmount - let user continue session
    };
  }, [id]);

  // Handle swipe action
  const handleSwipe = useCallback(async (direction: SwipeDirection) => {
    if (!currentMovie || isTransitioning) return;
    
    // Handle back navigation
    if (direction === 'right') {
      const success = goBack();
      if (success) {
        orbitHaptics.historyNav();
      } else {
        orbitHaptics.edgeReached();
      }
      return;
    }
    
    // Haptic feedback for swipe
    orbitHaptics.swipeComplete();
    
    setTransitioning(true);
    setPendingDirection(direction);
    
    // Check if we have prefetched data
    const prefetchKey = direction === 'left' ? 'vibe' : direction === 'down' ? 'aesthetic' : 'auteur';
    const prefetched = prefetchedMoves[prefetchKey];
    
    let result: { movie: OrbitMovie; connectionReason: string; similarityScore: number } | null = null;
    
    if (prefetched) {
      // Use prefetched data - instant transition!
      result = prefetched;
    } else {
      // Fetch new recommendation (fallback if prefetch didn't complete)
      result = await getNextMovie(currentMovie, direction, movieContext || undefined);
    }
    
    if (result) {
      // Set transition color before navigating
      setTransitionColor(result.movie.dominantHex);
      
      // Brief delay for transition effect
      setTimeout(() => {
        navigateTo(result!.movie, direction, result!.connectionReason, result!.similarityScore);
        
        // Pre-fetch next moves for new movie
        prefetchNextMoves(result!.movie, {
          cinematographer: result!.movie.cinematographer,
        }).then((moves) => {
          setPrefetchedMoves({
            vibe: moves.vibe || null,
            aesthetic: moves.aesthetic || null,
            auteur: moves.auteur || null,
          });
        });
      }, 300);
    } else {
      setTransitioning(false);
      setPendingDirection(null);
      // Could show error toast here
    }
  }, [currentMovie, isTransitioning, prefetchedMoves, movieContext, goBack, setTransitioning, setPendingDirection, navigateTo, setPrefetchedMoves]);

  // Handle long press (save movie)
  const handleLongPress = useCallback(() => {
    if (currentMovie) {
      toggleSaved(currentMovie.id);
      orbitHaptics.save();
      orbitHaptics.saved();
    }
  }, [currentMovie, toggleSaved]);

  // Handle exit
  const handleExit = useCallback(() => {
    exitOrbit();
    navigate(-1);
  }, [exitOrbit, navigate]);

  // Handle constellation toggle
  const handleToggleConstellation = useCallback(() => {
    setShowConstellation(!showConstellation);
  }, [showConstellation, setShowConstellation]);

  // Dismiss onboarding
  const handleDismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  if (isLoading) {
    return (
      <div 
        className="fixed inset-0 flex items-center justify-center"
        style={{ backgroundColor: transitionColor }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="w-12 h-12 text-white/70 animate-spin" />
          <p className="text-white/50 text-sm">Entering orbit...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      ref={containerRef}
      className="fixed inset-0 overflow-hidden"
      style={{ backgroundColor: currentMovie?.dominantHex || transitionColor }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={showOnboarding ? handleDismissOnboarding : undefined}
    >
      {/* Parry transition effect */}
      <ParryTransition
        isActive={isTransitioning}
        targetColor={transitionColor}
        direction={pendingDirection}
        onComplete={() => {
          // Transition complete callback if needed
        }}
      />

      {/* Main content */}
      <AnimatePresence mode="wait">
        {showConstellation ? (
          <motion.div
            key="constellation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
          >
            <ConstellationView />
          </motion.div>
        ) : (
          <motion.div
            key="cards"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
          >
            <OrbitCardStack
              onSwipe={handleSwipe}
              onLongPress={handleLongPress}
              isTransitioning={isTransitioning}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls overlay */}
      <OrbitControls
        onExit={handleExit}
        onToggleConstellation={handleToggleConstellation}
        showOnboarding={showOnboarding}
      />

      {/* Loading indicator during swipe */}
      <AnimatePresence>
        {isTransitioning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 backdrop-blur-md">
              <Loader2 className="w-4 h-4 text-white animate-spin" />
              <span className="text-white/70 text-sm">Finding next film...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

