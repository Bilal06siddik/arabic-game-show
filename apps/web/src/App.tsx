import { Navigate, Route, Routes } from 'react-router-dom';
import { BankLobbyPage } from './pages/BankLobbyPage';
import { BankRoomPage } from './pages/BankRoomPage';
import { CasinoLobbyPage } from './pages/CasinoLobbyPage';
import { CasinoRoomPage } from './pages/CasinoRoomPage';
import { LandingPage } from './pages/LandingPage';

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/casino" element={<CasinoLobbyPage />} />
      <Route path="/casino/:roomCode" element={<CasinoRoomPage />} />
      <Route path="/bank" element={<BankLobbyPage />} />
      <Route path="/bank/:roomCode" element={<BankRoomPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}