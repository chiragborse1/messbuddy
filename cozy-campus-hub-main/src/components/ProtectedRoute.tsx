import { Navigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/hooks/useUser";
import { hasActiveStudentAccess, hasAdminAccess } from "@/lib/access";

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRole: "student" | "admin";
}

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
    const { user, loading } = useUser();

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
            <Skeleton className="h-12 w-12 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-28" />
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
