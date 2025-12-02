import { useState, useEffect } from 'react';
import { Sparkles, ThumbsUp, ThumbsDown, CalendarPlus, Loader2, RefreshCw, SkipForward } from 'lucide-react';
import { useRecommendation, type RecommendationResult } from '../hooks/useRecommendation';

type RecommendationCardProps = {
  onAddToCalendar: (movie: RecommendationResult) => void;
};

export default function RecommendationCard({ onAddToCalendar }: RecommendationCardProps) {
  const {
    recommendation,
    isLoading,
    error,
    generateRecommendation,
    rateRecommendation,
    refreshRecommendation,
    skipRecommendation,
  } = useRecommendation();

  const [isRating, setIsRating] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [showSuccess, setShowSuccess] = useState<'up' | 'down' | null>(null);

  // Auto-generate recommendation on mount if none exists
  useEffect(() => {
    if (!recommendation && !isLoading && !error) {
      generateRecommendation();
    }
  }, []);

  const handleRate = async (rating: 'up' | 'down') => {
    if (!recommendation || isRating) return;
    
    setIsRating(true);
    setShowSuccess(rating);
    
    await rateRecommendation(recommendation, rating);
    
    // Brief delay to show success state
    setTimeout(() => {
      setShowSuccess(null);
      setIsRating(false);
      // Generate new recommendation after rating
      refreshRecommendation();
    }, 800);
  };

  const handleAddToCalendar = () => {
    if (recommendation) {
      onAddToCalendar(recommendation);
    }
  };

  const handleSkip = async () => {
    if (!recommendation || isSkipping) return;
    
    setIsSkipping(true);
    
    await skipRecommendation(recommendation);
    
    // Generate new recommendation
    setTimeout(() => {
      setIsSkipping(false);
      refreshRecommendation();
    }, 300);
  };

  if (isLoading && !recommendation) {
    return (
      <div className="mx-4 mb-6 p-6 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-blue-500/10">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-white">Next Watch</h3>
            <p className="text-xs text-gray-500">AI-powered recommendation</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <span className="ml-3 text-gray-400">Finding your next obsession...</span>
        </div>
      </div>
    );
  }

  if (error && !recommendation) {
    return (
      <div className="mx-4 mb-6 p-6 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-blue-500/10">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-white">Next Watch</h3>
            <p className="text-xs text-gray-500">AI-powered recommendation</p>
          </div>
        </div>
        <div className="text-center py-6">
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => generateRecommendation()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!recommendation) return null;

  return (
    <div className="mx-4 mb-6 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-blue-500/10">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-white">Next Watch</h3>
            <p className="text-xs text-gray-500">Based on your taste</p>
          </div>
        </div>
        <button
          onClick={() => refreshRecommendation()}
          disabled={isLoading}
          className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-full transition-colors disabled:opacity-50"
          title="Get new recommendation"
        >
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Movie Info */}
      <div className="p-4">
        <div className="flex gap-4">
          <img
            src={recommendation.poster}
            alt={recommendation.title}
            className="w-24 h-36 object-cover rounded-xl border border-gray-800 shadow-lg"
          />
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-white text-lg leading-tight truncate">
              {recommendation.title}
            </h4>
            <p className="text-sm text-gray-400 mt-1">
              {recommendation.year} • {recommendation.runtime}
            </p>
            
            {/* Vibe Check / Why this fits */}
            <div className="mt-3 p-3 rounded-xl bg-gray-800/50 border border-gray-700/50">
              <p className="text-sm text-gray-300 leading-relaxed italic">
                "{recommendation.reason}"
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 pt-0 space-y-3">
        {/* Rate Buttons Row */}
        <div className="flex gap-2">
          <button
            onClick={() => handleRate('up')}
            disabled={isRating || isSkipping}
            className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
              showSuccess === 'up'
                ? 'bg-green-500 text-white'
                : 'bg-green-900/30 text-green-400 hover:bg-green-900/50 border border-green-800/50'
            } disabled:opacity-50`}
          >
            <ThumbsUp size={18} className={showSuccess === 'up' ? 'fill-current' : ''} />
            {showSuccess === 'up' ? 'Liked!' : 'Like'}
          </button>
          <button
            onClick={() => handleRate('down')}
            disabled={isRating || isSkipping}
            className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
              showSuccess === 'down'
                ? 'bg-red-500 text-white'
                : 'bg-red-900/30 text-red-400 hover:bg-red-900/50 border border-red-800/50'
            } disabled:opacity-50`}
          >
            <ThumbsDown size={18} className={showSuccess === 'down' ? 'fill-current' : ''} />
            {showSuccess === 'down' ? 'Noted!' : 'Pass'}
          </button>
        </div>

        {/* Secondary Actions Row */}
        <div className="flex gap-2">
          {/* Not Now / Skip */}
          <button
            onClick={handleSkip}
            disabled={isRating || isSkipping}
            className="flex-1 py-3 rounded-xl font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            <SkipForward size={18} />
            {isSkipping ? 'Skipping...' : 'Not Now'}
          </button>

          {/* Add to Calendar */}
          <button
            onClick={handleAddToCalendar}
            disabled={isRating || isSkipping}
            className="flex-1 py-3 rounded-xl font-medium bg-white text-black hover:bg-gray-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            <CalendarPlus size={18} />
            Add to Calendar
          </button>
        </div>
      </div>
    </div>
  );
}

