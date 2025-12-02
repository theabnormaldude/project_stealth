import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, LogOut, Settings, ChevronDown, Bookmark, Sparkles } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

type ProfileDropdownProps = {
  profileImage: string;
  onOpenAvatarModal: () => void;
};

export default function ProfileDropdown({ profileImage, onOpenAvatarModal }: ProfileDropdownProps) {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 rounded-full hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <div className="h-10 w-10 rounded-full bg-gray-800 overflow-hidden border border-gray-700 shadow-md">
          <img src={profileImage} alt="User" className="w-full h-full object-cover" />
        </div>
        <ChevronDown 
          size={16} 
          className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#18181b] border border-gray-800 shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* User Info */}
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-sm font-medium text-white truncate">
              {user?.displayName || user?.email?.split('@')[0] || 'User'}
            </p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/watched');
              }}
              className="w-full px-4 py-3 flex items-center gap-3 text-left text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <Film size={18} className="text-gray-500" />
              <span>Watched</span>
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/watchlist');
              }}
              className="w-full px-4 py-3 flex items-center gap-3 text-left text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <Bookmark size={18} className="text-gray-500" />
              <span>Watchlist</span>
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/vibes');
              }}
              className="w-full px-4 py-3 flex items-center gap-3 text-left text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <Sparkles size={18} className="text-purple-400" />
              <span>Saved Vibes</span>
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                onOpenAvatarModal();
              }}
              className="w-full px-4 py-3 flex items-center gap-3 text-left text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <Settings size={18} className="text-gray-500" />
              <span>Edit Profile</span>
            </button>
          </div>

          {/* Sign Out */}
          <div className="border-t border-gray-800 py-1">
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-3 flex items-center gap-3 text-left text-red-400 hover:bg-red-900/20 transition-colors"
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

