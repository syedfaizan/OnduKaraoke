import { Navigate, Route, Routes } from 'react-router-dom';
import HostPage from './pages/HostPage.jsx';
import JoinPage from './pages/JoinPage.jsx';

/**
 * Two screens:
 *   /host          → the TV / laptop screen (player + queue + leaderboard)
 *   /join/:roomCode → the phone controller
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/host" replace />} />
      <Route path="/host" element={<HostPage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/join/:roomCode" element={<JoinPage />} />
    </Routes>
  );
}
