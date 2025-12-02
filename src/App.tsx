import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ExplorationProvider } from './contexts/ExplorationContext';
import ProtectedRoute from './components/ProtectedRoute';
import FeedbackFAB from './components/FeedbackFAB';
import SplashScreen from './screens/SplashScreen';
import LoginScreen from './screens/LoginScreen';
import WaitlistScreen from './screens/WaitlistScreen';
import WatchedScreen from './screens/WatchedScreen';
import WatchlistScreen from './screens/WatchlistScreen';
import MovieCalendarApp from './prototype/MovieCalendarApp';
import CleanupIMDBCalendar from './components/CleanupIMDBCalendar';
import DiscoverScreen from './screens/DiscoverScreen';
import MovieDetailScreen from './screens/MovieDetailScreen';
import SavedVibesScreen from './screens/SavedVibesScreen';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ExplorationProvider>
        <Routes>
          <Route path="/" element={<SplashScreen />} />
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/waitlist" element={<WaitlistScreen />} />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <MovieCalendarApp />
                <FeedbackFAB />
              </ProtectedRoute>
            }
          />
          <Route
            path="/watched"
            element={
              <ProtectedRoute>
                <WatchedScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/watchlist"
            element={
              <ProtectedRoute>
                <WatchlistScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cleanup"
            element={
              <ProtectedRoute>
                <CleanupIMDBCalendar />
              </ProtectedRoute>
            }
          />
          <Route
            path="/discover"
            element={
              <ProtectedRoute>
                <DiscoverScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/movie/:id"
            element={
              <ProtectedRoute>
                <MovieDetailScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vibes"
            element={
              <ProtectedRoute>
                <SavedVibesScreen />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ExplorationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
