import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { hasActiveStudentAccess, hasAdminAccess } from "@/lib/access";

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

    if (requiredRole === "admin" && !hasAdminAccess(user)) {
        return <Navigate to="/student" replace />;
    }

    if (requiredRole === "student" && !hasActiveStudentAccess(user)) {
        return <Navigate to={hasAdminAccess(user) ? "/admin" : "/"} replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
