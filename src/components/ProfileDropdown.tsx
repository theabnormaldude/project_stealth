import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuButtonBase =
    'w-full px-4 py-3 flex items-center gap-3 text-left rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40';
  const neutralButtonClasses =
    `${menuButtonBase} bg-[#16161f] text-gray-100 hover:bg-[#1f1f2e]`;
  const destructiveButtonClasses =
    `${menuButtonBase} bg-[#1f1015] text-red-400 hover:bg-[#2a1520] focus:ring-red-400/40`;

  // Calculate menu position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [isOpen]);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
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

      {isOpen && createPortal(
        <>
          {/* Backdrop to block everything behind */}
          <div 
            className="fixed inset-0 z-[9998]" 
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div 
            className="fixed w-56 rounded-xl bg-[#0a0a0f] border border-gray-700 shadow-2xl z-[9999] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
            style={{ top: menuPosition.top, right: menuPosition.right }}
          >
            {/* User Info */}
            <div className="px-4 py-3 bg-[#0a0a0f] border-b border-gray-700">
              <p className="text-sm font-medium text-white truncate">
                {user?.displayName || user?.email?.split('@')[0] || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>

            {/* Menu Items */}
            <div className="bg-[#0a0a0f] p-2 space-y-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/watched');
                }}
                className={neutralButtonClasses}
              >
                <Film size={18} className="text-gray-400" />
                <span>Watched</span>
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/watchlist');
                }}
                className={neutralButtonClasses}
              >
                <Bookmark size={18} className="text-gray-400" />
                <span>Watchlist</span>
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/vibes');
                }}
                className={neutralButtonClasses}
              >
                <Sparkles size={18} className="text-purple-400" />
                <span>Saved Vibes</span>
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenAvatarModal();
                }}
                className={neutralButtonClasses}
              >
                <Settings size={18} className="text-gray-400" />
                <span>Edit Profile</span>
              </button>
            </div>

            {/* Sign Out */}
            <div className="bg-[#0a0a0f] border-t border-gray-700 p-2">
              <button
                onClick={handleSignOut}
                className={destructiveButtonClasses}
              >
                <LogOut size={18} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

