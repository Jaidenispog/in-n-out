import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import AppShell from './components/AppShell'
import { LoadingScreen } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewMovement from './pages/NewMovement'
import ReturnCar from './pages/ReturnCar'
import Availability from './pages/Availability'
import Bookings from './pages/Bookings'
import SearchPage from './pages/SearchPage'
import RecordDetail from './pages/RecordDetail'
import ImportReview from './pages/ImportReview'
import Settings from './pages/Settings'
import Today from './pages/Today'
import Returns from './pages/Returns'
import AuditLog from './pages/AuditLog'
import CarIntake from './pages/CarIntake'
import HandBack from './pages/HandBack'

function SetupNeeded() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-bold">In N Out — setup needed</h1>
      <p className="text-ios-label2">
        The app is not connected to Supabase yet. Copy <code>.env.example</code> to{' '}
        <code>.env</code>, fill in <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> from your Supabase project settings, then restart / redeploy.
      </p>
    </div>
  )
}

function Gate() {
  const { ready, loading, session } = useAuth()
  if (!ready) return <SetupNeeded />
  if (loading) return <LoadingScreen />
  if (!session) return <Login />
  return <AppShell />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Gate />}>
            <Route index element={<Dashboard />} />
            <Route path="/new" element={<NewMovement />} />
            <Route path="/return" element={<ReturnCar />} />
            <Route path="/cars" element={<Availability />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/record/:type/:id" element={<RecordDetail />} />
            <Route path="/review" element={<ImportReview />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/today" element={<Today />} />
            <Route path="/returns" element={<Returns />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/intake" element={<CarIntake />} />
            <Route path="/handback" element={<HandBack />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
