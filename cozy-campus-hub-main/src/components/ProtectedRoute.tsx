import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useUser } from "@/contexts/UserContext";

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRole: "student" | "admin";
}

/**
 * Wraps a route and enforces role-based access.
 * - Loading  → spinner (no blank flash)
 * - Not logged in → redirect to /
 * - Wrong role → redirect to their own dashboard
 * - Correct role → render children
 */
const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
    const { user, loading } = useUser();

    // Show spinner while session resolves — prevents blank screen flash
    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
    );

    // Not authenticated → back to login
    if (!user) return <Navigate to="/" replace />;

    // Authenticated but wrong role → redirect to their dashboard
    // Treat 'developer' as 'admin' for access purposes
    const effectiveRole = user.role === "developer" ? "admin" : user.role;
    if (effectiveRole !== requiredRole) {
        const redirectTo = effectiveRole === "admin" ? "/admin" : "/student";
        return <Navigate to={redirectTo} replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;

