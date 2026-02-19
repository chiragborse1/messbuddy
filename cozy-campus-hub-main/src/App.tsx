import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { UserProvider } from "@/contexts/UserContext";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();


const App = () => (
  <QueryClientProvider client={queryClient}>
    <UserProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />

            {/* Student Routes */}
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="/student/menu" element={<StudentMenu />} />
            <Route path="/student/fees" element={<StudentFees />} />
            <Route path="/student/leave" element={<StudentLeave />} />
            <Route path="/student/help" element={<StudentHelp />} />
            <Route path="/student/profile" element={<StudentProfile />} />
            <Route path="/student/feedback" element={<StudentFeedback />} />
            <Route path="/student/chat" element={<StudentChat />} />

            {/* Admin Routes */}
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/students" element={<AdminStudents />} />
            <Route path="/admin/menu" element={<AdminMenu />} />
            <Route path="/admin/payments" element={<AdminPayments />} />
            <Route path="/admin/leaves" element={<AdminLeaves />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/chat" element={<AdminChat />} />
            <Route path="/admin/profile" element={<AdminProfile />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </UserProvider>
  </QueryClientProvider>
);

export default App;
