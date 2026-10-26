import { useEffect } from "react";
import { Navigate, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import LoginPage from "./components/auth/LoginPage";
import NotFound from "./views/NotFound";
import { AuthProvider } from "./contexts/AuthContext";
import { ConfigProvider, useConfig } from "./contexts/ConfigContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { BurnerProvider } from "./contexts/BurnerContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Header from "./components/Header";
import Sidebar from "./components/navigation/Sidebar";
import BottomNav from "./components/navigation/BottomNav";
import FAB from "./components/FAB";
import HistoryView from "./views/HistoryView";
import HistoryList from "./components/history/HistoryList";
import EntryView from "./views/EntryView";
import StatisticsView from "./components/stats/StatisticsView";
import SettingsView from "./views/SettingsView";
import GoalsView from "./views/GoalsView";
import { ToastProvider } from "./components/ui/ToastProvider";
import AchievementsView from "./views/AchievementsView";
import LandingPage from "./views/LandingPage";
import AboutPage from "./views/AboutPage";
import { useMoodData } from "./hooks/useMoodData";
import { useGroups } from "./hooks/useGroups";
import { useStatistics } from "./hooks/useStatistics";
import MusicDock from './components/mood/MusicDock'
import EarwormView from './features/earworm/EarwormView';
import "./App.css";

const MusicDockGate = () => {
  const { config } = useConfig();

  if (!config.enable_mood_music) return null;
  return <MusicDock />;
};

const AppContent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Custom hooks
  const { pastEntries, setPastEntries, refreshHistory } = useMoodData();
  const { groups, createGroup, createGroupOption } = useGroups();
  const { statistics, currentStreak, loading: statsLoading, error: statsError, loadStatistics } = useStatistics();

  const handleMoodSelect = (moodValue) => {
    navigate('entry', { state: { mood: moodValue } });
  };

  const handleBackToHistory = () => {
    navigate('/dashboard');
  };

  const upsertEntry = (entry) => {
    if (!entry?.id) return;

    setPastEntries((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === entry.id);
      if (existingIndex === -1) {
        return [entry, ...prev];
      }

      return prev.map((item) => (
        item.id === entry.id ? { ...item, ...entry } : item
      ));
    });
  };

  const handleEntryDeleted = (deletedEntryId) => {
    // Remove the deleted entry from the local state
    setPastEntries(prev => prev.filter(entry => entry.id !== deletedEntryId));
  };

  const handleEditMoodSelect = (moodValue) => {
    navigate('.', { state: { ...location.state, mood: moodValue }, replace: true });
  };

  const handleEntryUpdated = (updatedEntry, options = {}) => {
    const {
      navigateAfterSave = true,
      refreshAfterSave = true,
    } = options;

    upsertEntry(updatedEntry);

    if (navigateAfterSave) {
      navigate('/dashboard');
    }

    if (refreshAfterSave) {
      refreshHistory();
    }
  };

  // Helper to get state from location
  const locationState = location.state || {};
  const { mood: selectedMood, entry: editingEntry } = locationState;
  
  // Determine if we are in entry view for layout purposes (no sidebar)
  const isEntryView = location.pathname.endsWith('/entry');

  useEffect(() => {
    const handler = () => {
      if (!location.pathname.startsWith('/dashboard')) {
        navigate('/dashboard');
        return;
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('nightlio:new-entry', handler);
    return () => window.removeEventListener('nightlio:new-entry', handler);
  }, [location.pathname, navigate]);

  return (
    <>
      <div className={`app-page ${isEntryView ? 'no-sidebar' : ''}`}>
        <Sidebar
          onLoadStatistics={loadStatistics}
        />
        
        <div className="app-shell">
          <Header
            currentStreak={currentStreak}
          />

          <div className="app-layout">

            <main className="app-main">
              <Routes>
                <Route index element={
                  <EarwormView />
                } />
                <Route path="earworm" element={<EarwormView />} />
                <Route path="entry" element={
                  <EntryView
                    selectedMood={selectedMood}
                    groups={groups}
                    onBack={handleBackToHistory}
                    onEntryDeleted={handleEntryDeleted}
                    onCreateGroup={createGroup}
                    onCreateOption={createGroupOption}
                    editingEntry={editingEntry}
                    onEntryUpdated={handleEntryUpdated}
                    onEditMoodSelect={handleEditMoodSelect}
                    onSelectMood={handleMoodSelect}
                  />
                } />
                <Route path="stats" element={
                  <StatisticsView
                    statistics={statistics}
                    pastEntries={pastEntries}
                    loading={statsLoading}
                    error={statsError}
                  />
                } />
                <Route path="achievements" element={<AchievementsView />} />
                <Route path="goals" element={<GoalsView />} />
                <Route path="settings" element={<SettingsView />} />
              </Routes>
            </main>
            
            <Routes>
              <Route index element={null} />
            </Routes>
          </div>
        </div>
      </div>

      <BottomNav
        onLoadStatistics={loadStatistics}
      />

      <FAB
        onClick={() => {
          if (location.pathname === '/dashboard' || location.pathname === '/dashboard/') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            navigate('/dashboard');
          }
        }}
        label="Scroll to top"
      />
      <MusicDockGate />
    </>
  );
};

function App() {
  return (
    <ConfigProvider>
      <ThemeProvider>
        <ToastProvider>
          <BurnerProvider>
            <AuthProvider>
              <Routes>
                {/* Earworm's calendar is the product home. */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/dashboard/*"
                  element={
                    <ProtectedRoute>
                      <AppContent />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AuthProvider>
          </BurnerProvider>
        </ToastProvider>
      </ThemeProvider>
    </ConfigProvider>
  );
}

export default App;
