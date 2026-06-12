import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';

import Login from './pages/Login';
import Monitoring from './pages/Monitoring';
import Schedule from './pages/Schedule';
import Media from './pages/Media';
import Accounts from './pages/Accounts';
import Logs from './pages/Logs';

const ProtectedRoute = ({ children }) => {
  const apiKey = localStorage.getItem('api_key');
  if (!apiKey) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Dashboard Routes */}
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/monitoring" replace />} />
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="media" element={<Media />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="logs" element={<Logs />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
