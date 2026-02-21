import { SpeedInsights } from "@vercel/speed-insights/react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { UserProvider } from "@/contexts/UserContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import ProtectedRoute from "@/components/ProtectedRoute";

// Page Imports
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import StudentDashboard from "./pages/student/StudentDashboard";
import StudentMenu from "./pages/student/StudentMenu";
import StudentFees from "./pages/student/StudentFees";
import StudentLeave from "./pages/student/StudentLeave";
import StudentHelp from "./pages/student/StudentHelp";
import StudentProfile from "./pages/student/StudentProfile";
import StudentFeedback from "./pages/student/StudentFeedback";
import StudentChat from "./pages/student/StudentChat";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminStudents from "./pages/admin/AdminStudents";
import AdminMenu from "./pages/admin/AdminMenu";
import AdminPayments from "./pages/admin/AdminPayments";
import AdminLeaves from "./pages/admin/AdminLeaves";
import AdminProfile from "./pages/admin/AdminProfile";
import AdminChat from "./pages/admin/AdminChat";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminNotifications from "./pages/admin/AdminNotifications";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <AppWithNotifications />
      </UserProvider>
      <SpeedInsights />
    </QueryClientProvider>
  );
};

const AppWithNotifications = () => {
  usePushNotifications();

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Student Routes — requires role: student */}
          <Route path="/student" element={<ProtectedRoute requiredRole="student"><StudentDashboard /></ProtectedRoute>} />
          <Route path="/student/menu" element={<ProtectedRoute requiredRole="student"><StudentMenu /></ProtectedRoute>} />
          <Route path="/student/fees" element={<ProtectedRoute requiredRole="student"><StudentFees /></ProtectedRoute>} />
          <Route path="/student/leave" element={<ProtectedRoute requiredRole="student"><StudentLeave /></ProtectedRoute>} />
          <Route path="/student/help" element={<ProtectedRoute requiredRole="student"><StudentHelp /></ProtectedRoute>} />
          <Route path="/student/profile" element={<ProtectedRoute requiredRole="student"><StudentProfile /></ProtectedRoute>} />
          <Route path="/student/feedback" element={<ProtectedRoute requiredRole="student"><StudentFeedback /></ProtectedRoute>} />
          <Route path="/student/chat" element={<ProtectedRoute requiredRole="student"><StudentChat /></ProtectedRoute>} />

          {/* Admin Routes — requires role: admin */}
          <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/students" element={<ProtectedRoute requiredRole="admin"><AdminStudents /></ProtectedRoute>} />
          <Route path="/admin/menu" element={<ProtectedRoute requiredRole="admin"><AdminMenu /></ProtectedRoute>} />
          <Route path="/admin/payments" element={<ProtectedRoute requiredRole="admin"><AdminPayments /></ProtectedRoute>} />
          <Route path="/admin/leaves" element={<ProtectedRoute requiredRole="admin"><AdminLeaves /></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute requiredRole="admin"><AdminAnalytics /></ProtectedRoute>} />
          <Route path="/admin/notifications" element={<ProtectedRoute requiredRole="admin"><AdminNotifications /></ProtectedRoute>} />
          <Route path="/admin/chat" element={<ProtectedRoute requiredRole="admin"><AdminChat /></ProtectedRoute>} />
          <Route path="/admin/profile" element={<ProtectedRoute requiredRole="admin"><AdminProfile /></ProtectedRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
};

export default App;
