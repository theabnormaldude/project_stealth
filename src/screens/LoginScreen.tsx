import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Mail, Lock, Loader2, ArrowRight, Chrome, UserPlus, LogIn } from 'lucide-react';

type Step = 'email' | 'choose' | 'signin' | 'signup';

export default function LoginScreen() {
  const { checkWhitelist, signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCheckAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const whitelisted = await checkWhitelist(email);
      if (whitelisted) {
        setStep('choose');
      } else {
        navigate('/waitlist', { replace: true });
      }
    } catch (err) {
      setError('Unable to verify access. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await signIn(email, password);
      navigate('/app', { replace: true });
    } catch (err: any) {
      console.log('Sign in error:', err.code, err.message);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Invalid email or password. Try again or create a new account.');
      } else {
        setError('Sign in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await signUp(email, password);
      navigate('/app', { replace: true });
    } catch (err: any) {
      if (err.message === 'Email not whitelisted') {
        navigate('/waitlist', { replace: true });
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Account already exists. Try signing in instead.');
      } else {
        setError('Sign up failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');

    try {
      await signInWithGoogle();
      navigate('/app', { replace: true });
    } catch (err: any) {
      if (err.message === 'Email not whitelisted') {
        navigate('/waitlist', { replace: true });
      } else {
        setError('Google sign in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            ViewFindr
          </h1>
          <p className="text-sm text-gray-500">
            {step === 'email' && 'Enter your email to get started'}
            {step === 'choose' && 'You\'re on the list! How would you like to continue?'}
            {step === 'signin' && 'Welcome back! Enter your password'}
            {step === 'signup' && 'Create your account'}
          </p>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-3 text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        {step === 'email' && (
          <form onSubmit={handleCheckAccess} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                autoFocus
                autoComplete="email"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white hover:bg-gray-200 text-black font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Check Access
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-800" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#09090b] px-4 text-gray-500">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-800 text-white font-medium py-4 rounded-xl flex items-center justify-center gap-3 transition-all disabled:opacity-50"
            >
              <Chrome className="w-5 h-5" />
              Continue with Google
            </button>
          </form>
        )}

        {step === 'choose' && (
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3">
              <Mail className="text-gray-500 w-5 h-5" />
              <span className="text-gray-300 text-sm">{email}</span>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setError('');
                }}
                className="ml-auto text-xs text-blue-400 hover:text-blue-300"
              >
                Change
              </button>
            </div>

            <button
              onClick={() => {
                setStep('signup');
                setError('');
              }}
              className="w-full bg-white hover:bg-gray-200 text-black font-semibold py-4 rounded-xl flex items-center justify-center gap-3 transition-all"
            >
              <UserPlus className="w-5 h-5" />
              Create New Account
            </button>

            <button
              onClick={() => {
                setStep('signin');
                setError('');
              }}
              className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-800 text-white font-medium py-4 rounded-xl flex items-center justify-center gap-3 transition-all"
            >
              <LogIn className="w-5 h-5" />
              I Already Have an Account
            </button>
          </div>
        )}

        {step === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3">
              <Mail className="text-gray-500 w-5 h-5" />
              <span className="text-gray-300 text-sm">{email}</span>
              <button
                type="button"
                onClick={() => setStep('choose')}
                className="ml-auto text-xs text-blue-400 hover:text-blue-300"
              >
                Back
              </button>
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                autoFocus
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white hover:bg-gray-200 text-black font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        )}

        {step === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3">
              <Mail className="text-gray-500 w-5 h-5" />
              <span className="text-gray-300 text-sm">{email}</span>
              <button
                type="button"
                onClick={() => setStep('choose')}
                className="ml-auto text-xs text-blue-400 hover:text-blue-300"
              >
                Back
              </button>
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
              <input
                type="password"
                placeholder="Create a password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                autoFocus
                autoComplete="new-password"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
              <input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white hover:bg-gray-200 text-black font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Create Account
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        )}
      </div>

      <div className="absolute bottom-8 text-center">
        <p className="text-xs text-gray-600">
          Invite-only beta
        </p>
      </div>
    </div>
  );
}
