import { Navigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRole: "student" | "admin";
}

/**
 * Wraps a route and enforces role-based access.
 * - Not logged in → redirect to /
 * - Wrong role → redirect to their own dashboard
 * - Correct role → render children
 */
const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
    const { user, loading } = useUser();

    // While session is being loaded, render nothing (avoids flash redirect)
    if (loading) return null;

    // Not authenticated → back to login
    if (!user) return <Navigate to="/" replace />;

    // Authenticated but wrong role → redirect to their dashboard
    if (user.role !== requiredRole) {
        const redirectTo = user.role === "admin" ? "/admin" : "/student";
        return <Navigate to={redirectTo} replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
