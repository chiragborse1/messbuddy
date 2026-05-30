import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useUser } from "@/hooks/useUser";

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRole: "student" | "admin";
}

/**
 * Wraps a route and enforces role-based access.
 * - Loading    → spinner (no blank screen flash)
 * - Not logged in → redirect to /
 * - Admin routes → allow 'admin' and 'developer' roles
 * - Student routes → allow 'student' role only
 */
const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
    const { user, loading } = useUser();

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
    );

    if (!user) return <Navigate to="/" replace />;

    // Both 'admin' and 'developer' roles can access admin routes
    const hasAdminAccess = user.role === "admin" || user.role === "developer";
    const hasStudentAccess = user.role === "student";

    if (requiredRole === "admin" && !hasAdminAccess) {
        return <Navigate to="/student" replace />;
    }

    if (requiredRole === "student" && !hasStudentAccess) {
        return <Navigate to="/admin" replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;

