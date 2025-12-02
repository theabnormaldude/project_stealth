import { useState } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export default function CleanupIMDBCalendar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [cleanupDate, setCleanupDate] = useState('2025-11-29'); // Default to the problematic date
  const [stats, setStats] = useState<{ total: number; byDate: Record<string, number> } | null>(null);

  // Analyze calendar to show what's there
  const analyzeCalendar = async () => {
    if (!user) return;
    
    setIsRunning(true);
    try {
      const calendarRef = collection(db, 'users', user.uid, 'calendar_logs');
      const snapshot = await getDocs(calendarRef);
      
      const byDate: Record<string, number> = {};
      
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const date = data.date || 'unknown';
        byDate[date] = (byDate[date] || 0) + 1;
      });
      
      setStats({ total: snapshot.size, byDate });
    } catch (err) {
      console.error('Analysis failed:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const runCleanup = async () => {
    if (!user) {
      setResult('Not logged in');
      return;
    }

    setIsRunning(true);
    setResult(null);

    try {
      const calendarRef = collection(db, 'users', user.uid, 'calendar_logs');
      const snapshot = await getDocs(calendarRef);
      
      let deleted = 0;
      let kept = 0;

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        // Only delete entries that:
        // 1. Are on the specified date AND
        // 2. Were imported (have source: 'imdb' or 'letterboxd')
        // This keeps manually added movies like Jackie Brown
        const isOnTargetDate = data.date === cleanupDate;
        const isImported = data.source === 'imdb' || data.source === 'letterboxd';
        
        if (isOnTargetDate && isImported) {
          await deleteDoc(doc(db, 'users', user.uid, 'calendar_logs', docSnap.id));
          deleted++;
        } else {
          kept++;
        }
      }

      setResult(`✅ Cleanup complete! Deleted ${deleted} imported entries from ${cleanupDate}. Kept ${kept} entries.`);
      setStats(null); // Clear stats to refresh
    } catch (err) {
      console.error('Cleanup failed:', err);
      setResult('Cleanup failed: ' + (err as Error).message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div style={{ 
      padding: '20px', 
      background: '#0a0a0a', 
      minHeight: '100vh',
      color: 'white',
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <button
          onClick={() => navigate('/app')}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            marginBottom: '20px',
            fontSize: '14px',
          }}
        >
          ← Back to Calendar
        </button>

        <div style={{ 
          padding: '24px', 
          background: '#1a1a1a', 
          borderRadius: '16px',
          marginBottom: '20px',
        }}>
          <h2 style={{ marginBottom: '8px' }}>🧹 Calendar Cleanup Tool</h2>
          <p style={{ color: '#888', marginBottom: '24px', fontSize: '14px' }}>
            Clean up incorrectly imported calendar entries. This only affects calendar logs - 
            your Watched section remains untouched.
          </p>
          
          <button
            onClick={analyzeCalendar}
            disabled={isRunning}
            style={{
              background: '#333',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              marginBottom: '16px',
              width: '100%',
            }}
          >
            {isRunning ? 'Analyzing...' : '📊 Analyze Calendar'}
          </button>

          {stats && (
            <div style={{ 
              background: '#222', 
              padding: '16px', 
              borderRadius: '8px',
              marginBottom: '20px',
            }}>
              <p style={{ fontWeight: 600, marginBottom: '12px' }}>
                Total calendar entries: {stats.total}
              </p>
              <p style={{ color: '#888', fontSize: '14px', marginBottom: '8px' }}>
                Entries by date:
              </p>
              <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                {Object.entries(stats.byDate)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([date, count]) => (
                    <div 
                      key={date} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        padding: '4px 0',
                        borderBottom: '1px solid #333',
                        color: count > 10 ? '#ff6b6b' : '#aaa',
                      }}
                    >
                      <span>{date}</span>
                      <span style={{ fontWeight: count > 10 ? 600 : 400 }}>
                        {count} {count > 10 ? '⚠️' : ''}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>
              Date to clean up (imported entries only):
            </label>
            <input
              type="date"
              value={cleanupDate}
              onChange={(e) => setCleanupDate(e.target.value)}
              style={{
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #444',
                background: '#222',
                color: 'white',
                fontSize: '16px',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
          </div>
          
          <button
            onClick={runCleanup}
            disabled={isRunning}
            style={{
              background: isRunning ? '#444' : '#e53935',
              color: 'white',
              border: 'none',
              padding: '14px 24px',
              borderRadius: '8px',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              width: '100%',
            }}
          >
            {isRunning ? 'Cleaning up...' : `🗑️ Clean up ${cleanupDate}`}
          </button>
          
          {result && (
            <p style={{ 
              marginTop: '16px', 
              padding: '12px', 
              background: result.includes('failed') ? '#4a1a1a' : '#1a4a1a',
              borderRadius: '8px',
            }}>
              {result}
            </p>
          )}
        </div>

        <div style={{ 
          padding: '24px', 
          background: '#1a1a1a', 
          borderRadius: '16px',
        }}>
          <h3 style={{ marginBottom: '12px' }}>📥 After Cleanup: Re-import with Correct Dates</h3>
          <p style={{ color: '#888', fontSize: '14px', marginBottom: '16px' }}>
            After cleaning up, re-import your movies to add them back with correct dates:
          </p>
          <ol style={{ color: '#aaa', fontSize: '14px', paddingLeft: '20px', lineHeight: 1.8 }}>
            <li><strong>Letterboxd:</strong> Go to Watched → Import → Enter your username</li>
            <li><strong>IMDB:</strong> Export your ratings CSV from IMDB, then upload it in Watched → Import</li>
          </ol>
          <p style={{ color: '#666', fontSize: '12px', marginTop: '16px' }}>
            The import now uses the actual "Date Rated" from your IMDB export and watch dates from Letterboxd diary.
          </p>
        </div>
      </div>
    </div>
  );
}

