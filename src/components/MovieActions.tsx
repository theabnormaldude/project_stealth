import { useState } from 'react';
import { Calendar, BookmarkPlus, Eye, ThumbsUp, ThumbsDown, Loader2, Check } from 'lucide-react';

type MovieActionsProps = {
  onAddToCalendar: () => void;
  onAddToWatchlist: () => void;
  onMarkAsSeen: (rating: 'up' | 'down') => void;
  isInWatchlist: boolean;
  isMarkedSeen: boolean;
  isAddingToCalendar?: boolean;
  isAddingToWatchlist?: boolean;
  isMarkingSeen?: boolean;
};

export default function MovieActions({
  onAddToCalendar,
  onAddToWatchlist,
  onMarkAsSeen,
  isInWatchlist,
  isMarkedSeen,
  isAddingToCalendar = false,
  isAddingToWatchlist = false,
  isMarkingSeen = false,
}: MovieActionsProps) {
  const [showRatingButtons, setShowRatingButtons] = useState(false);
  const [selectedRating, setSelectedRating] = useState<'up' | 'down' | null>(null);

  const handleMarkAsSeenClick = () => {
    if (isMarkedSeen) return;
    setShowRatingButtons(true);
  };

  const handleRating = (rating: 'up' | 'down') => {
    setSelectedRating(rating);
    onMarkAsSeen(rating);
  };

  return (
    <div className="flex gap-3">
      {/* Add to Calendar */}
      <button
        onClick={onAddToCalendar}
        disabled={isAddingToCalendar}
        className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-white text-black font-semibold transition-all hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isAddingToCalendar ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Calendar className="w-5 h-5" />
        )}
        <span>Add to Calendar</span>
      </button>

      {/* Add to Watchlist */}
      <button
        onClick={onAddToWatchlist}
        disabled={isAddingToWatchlist || isInWatchlist}
        className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-semibold transition-all ${
          isInWatchlist
            ? 'bg-green-600 text-white cursor-default'
            : 'bg-gray-800 text-white hover:bg-gray-700 border border-gray-700'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isAddingToWatchlist ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isInWatchlist ? (
          <Check className="w-5 h-5" />
        ) : (
          <BookmarkPlus className="w-5 h-5" />
        )}
        <span className="hidden sm:inline">{isInWatchlist ? 'In Watchlist' : 'Watchlist'}</span>
      </button>

      {/* Mark as Seen - morphs to rating buttons */}
      <div className="relative">
        {!showRatingButtons && !isMarkedSeen ? (
          <button
            onClick={handleMarkAsSeenClick}
            disabled={isMarkingSeen}
            className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-gray-800 text-white font-semibold transition-all hover:bg-gray-700 border border-gray-700 disabled:opacity-50"
          >
            {isMarkingSeen ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Eye className="w-5 h-5" />
            )}
            <span className="hidden sm:inline">Seen</span>
          </button>
        ) : isMarkedSeen ? (
          <div className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-semibold ${
            selectedRating === 'up' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {selectedRating === 'up' ? (
              <ThumbsUp className="w-5 h-5 fill-current" />
            ) : (
              <ThumbsDown className="w-5 h-5 fill-current" />
            )}
            <span className="hidden sm:inline">Rated</span>
          </div>
        ) : (
          <div className="flex gap-2 animate-in slide-in-from-left-2 duration-200">
            <button
              onClick={() => handleRating('up')}
              disabled={isMarkingSeen}
              className="flex items-center justify-center gap-1.5 py-3.5 px-4 rounded-xl bg-green-600 text-white font-semibold transition-all hover:bg-green-500 disabled:opacity-50"
            >
              {isMarkingSeen && selectedRating === 'up' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ThumbsUp className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={() => handleRating('down')}
              disabled={isMarkingSeen}
              className="flex items-center justify-center gap-1.5 py-3.5 px-4 rounded-xl bg-red-600 text-white font-semibold transition-all hover:bg-red-500 disabled:opacity-50"
            >
              {isMarkingSeen && selectedRating === 'down' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ThumbsDown className="w-5 h-5" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

