import { ChevronRight } from 'lucide-react';

type SearchResultCardProps = {
  movieId: number;
  title: string;
  year: string;
  posterPath: string | null;
  backdropPath: string | null;
  genres: string[];
  onClick: () => void;
};

const buildImageUrl = (path: string | null, size: 'w200' | 'w500' | 'w780' | 'w1280' = 'w500') => {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

export default function SearchResultCard({
  title,
  year,
  posterPath,
  backdropPath,
  genres,
  onClick,
}: SearchResultCardProps) {
  const backdropUrl = buildImageUrl(backdropPath, 'w780');
  const posterUrl = buildImageUrl(posterPath, 'w200');
  const displayGenres = genres.slice(0, 3);

  return (
    <button
      onClick={onClick}
      className="w-full h-20 rounded-xl overflow-hidden relative group transition-transform active:scale-[0.98]"
    >
      {/* Backdrop Image */}
      {backdropUrl ? (
        <img
          src={backdropUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-r from-gray-800 to-gray-900" />
      )}
      
      {/* Gradient Overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40" />
      
      {/* Content */}
      <div className="relative h-full flex items-center gap-3 px-3">
        {/* Poster Thumbnail */}
        <div className="w-12 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-white/20 shadow-lg">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-700 flex items-center justify-center">
              <span className="text-xs text-gray-400">?</span>
            </div>
          )}
        </div>
        
        {/* Title & Metadata */}
        <div className="flex-1 min-w-0 text-left">
          <h3 className="font-semibold text-white text-base truncate leading-tight">
            {title}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-300">{year}</span>
            {displayGenres.length > 0 && (
              <>
                <span className="text-gray-500">•</span>
                <div className="flex gap-1 overflow-hidden">
                  {displayGenres.map((genre, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300 truncate"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Arrow indicator */}
        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors flex-shrink-0" />
      </div>
    </button>
  );
}
