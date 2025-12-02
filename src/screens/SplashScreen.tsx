import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function SplashScreen() {
  const { user, loading, isWhitelisted } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate('/login', { replace: true });
    } else if (isWhitelisted === false) {
      navigate('/waitlist', { replace: true });
    } else if (isWhitelisted === true) {
      navigate('/app', { replace: true });
    }
  }, [user, loading, isWhitelisted, navigate]);

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center">
      <div className="text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-white">
            ViewFindr
          </h1>
          <p className="text-sm text-gray-500 uppercase tracking-widest">
            Your Personal Cinema Journal
          </p>
        </div>
        
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
      
      <div className="absolute bottom-8 text-center">
        <p className="text-xs text-gray-600">
          Beta v0.1
        </p>
      </div>
    </div>
  );
}

