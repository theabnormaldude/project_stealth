import { motion } from 'framer-motion';
import { Star, Bookmark, BookmarkCheck } from 'lucide-react';
import type { OrbitMovie } from '../../stores/orbitStore';

interface OrbitCardProps {
  movie: OrbitMovie;
  isSaved: boolean;
  connectionReason?: string;
  onSaveToggle: () => void;
  isActive?: boolean;
}

const buildImageUrl = (path: string | null, size: 'w500' | 'w780' | 'original' = 'w500') => {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

export default function OrbitCard({
  movie,
  isSaved,
  connectionReason,
  onSaveToggle: _onSaveToggle,
  isActive = true,
}: OrbitCardProps) {
  // onSaveToggle is passed for future use but long-press handled in parent
  const posterUrl = buildImageUrl(movie.posterPath, 'w500');
  const backdropUrl = buildImageUrl(movie.backdropPath, 'original');

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center p-6"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: isActive ? 1 : 0.5, scale: isActive ? 1 : 0.95 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
    >
      {/* Backdrop gradient overlay */}
      {backdropUrl && (
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${backdropUrl})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/40" />

      {/* Card content */}
      <div className="relative z-10 flex flex-col items-center max-w-sm w-full">
        {/* Connection reason badge */}
        {connectionReason && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-4 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20"
          >
            <p className="text-sm text-white/90 font-medium">{connectionReason}</p>
          </motion.div>
        )}

        {/* Poster */}
        <motion.div
          className="relative rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10"
          style={{ 
            boxShadow: `0 25px 50px -12px ${movie.dominantHex}66, 0 0 0 1px ${movie.dominantHex}33` 
          }}
          whileHover={{ scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={movie.title}
              className="w-64 h-96 object-cover"
              loading="eager"
            />
          ) : (
            <div 
              className="w-64 h-96 flex items-center justify-center"
              style={{ backgroundColor: movie.dominantHex }}
            >
              <Star className="w-16 h-16 text-white/50" />
            </div>
          )}

          {/* Save indicator overlay */}
          {isSaved && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-3 right-3 p-2 rounded-full bg-green-500 shadow-lg"
            >
              <BookmarkCheck className="w-5 h-5 text-white" />
            </motion.div>
          )}
        </motion.div>

        {/* Movie info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6 text-center"
        >
          <h2 className="text-2xl font-bold text-white mb-1">{movie.title}</h2>
          <p className="text-white/60 text-lg">{movie.year}</p>
          
          {movie.director && (
            <p className="text-white/40 text-sm mt-2">
              Directed by {movie.director}
            </p>
          )}

          {movie.genres && movie.genres.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {movie.genres.slice(0, 3).map((genre) => (
                <span
                  key={genre}
                  className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-white/70"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}
        </motion.div>

        {/* Save button hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 flex items-center gap-2 text-white/40 text-sm"
        >
          <Bookmark className="w-4 h-4" />
          <span>Hold to save</span>
        </motion.div>
      </div>
    </motion.div>
  );
}

