import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Lock, ArrowLeft, Mail } from 'lucide-react';

export default function WaitlistScreen() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleGoBack = async () => {
    if (user) {
      await signOut();
    }
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center space-y-8">
        <div className="mx-auto w-20 h-20 rounded-full bg-amber-900/20 border border-amber-800/50 flex items-center justify-center">
          <Lock className="w-10 h-10 text-amber-500" />
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-white">
            Access Restricted
          </h1>
          <p className="text-gray-400 leading-relaxed">
            ViewFindr is currently invite-only. We're carefully curating our beta community to ensure the best experience.
          </p>
        </div>

        {user?.email && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
            <Mail className="text-gray-500 w-5 h-5 flex-shrink-0" />
            <span className="text-gray-300 text-sm truncate">{user.email}</span>
          </div>
        )}

        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 space-y-2">
          <p className="text-sm text-gray-400">
            Want to join the beta?
          </p>
          <p className="text-sm text-gray-500">
            Reach out to the team and we'll add you to the list.
          </p>
        </div>

        <button
          onClick={handleGoBack}
          className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-800 text-white font-medium py-4 rounded-xl flex items-center justify-center gap-2 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
          Try a Different Email
        </button>
      </div>

      <div className="absolute bottom-8 text-center">
        <p className="text-xs text-gray-600">
          ViewFindr Beta
        </p>
      </div>
    </div>
  );
}

