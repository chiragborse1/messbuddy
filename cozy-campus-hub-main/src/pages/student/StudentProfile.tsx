import PageShell from "@/components/PageShell";
import StudentBottomNav from "@/components/StudentBottomNav";
import { useUser } from "@/hooks/useUser";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { User, Mail, Phone, GraduationCap, Building2, LogOut, AlertCircle, Loader2, Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";
import ProfileEditDialog from "@/components/ProfileEditDialog";
import ThemeToggle from "@/components/ThemeToggle";

const StudentProfile = () => {
    const { user, logout, refreshProfile } = useUser();
    const navigate = useNavigate();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleLogout = () => {
        logout();
        navigate("/");
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await refreshProfile();
        } finally {
            setIsRefreshing(false);
        }
    };



    if (!user) {
        navigate("/");
        return null;
    }

    return (
        <>
            <PageShell>
                <div className="pt-12 pb-20">
                    <h1 className="text-2xl font-bold mb-6">My Profile</h1>

                    {/* Profile Photo */}
                    <div className="flex justify-center mb-6">
                        <div className="relative">
                            <div className="w-32 h-32 rounded-3xl bg-muted flex items-center justify-center overflow-hidden border-4 border-border">
                                {user.photo ? (
                                    <img src={user.photo} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-16 h-16 text-muted-foreground" />
                                )}
                            </div>
                            <ProfileEditDialog fields={["name", "mobile", "college", "course"]}>
                                <Button
                                    type="button"
                                    size="icon"
                                    className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full shadow-lg"
                                    title="Edit profile"
                                >
                                    <Pencil className="w-4 h-4" />
                                </Button>
                            </ProfileEditDialog>
                        </div>
                    </div>

                    {/* User Info Cards */}
                    <div className="space-y-3 mb-6">
                        <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <User className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Full Name</p>
                                    <p className="text-sm font-semibold">{user.name}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Mail className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Email</p>
                                    <p className="text-sm font-semibold">{user.email}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Phone className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Mobile Number</p>
                                    <p className="text-sm font-semibold">{user.mobile}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Building2 className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">College</p>
                                    <p className="text-sm font-semibold">{user.college}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <GraduationCap className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Course</p>
                                    <p className="text-sm font-semibold">{user.course}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mb-4">
                        <ThemeToggle />
                    </div>

                    {/* Refresh Profile Button */}
                    <div className="mb-4">
                        <Button
                            variant="ghost"
                            className="w-full h-12 rounded-xl border border-border/50 justify-start px-4 text-base font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                        >
                            {isRefreshing ? (
                                <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                            ) : (
                                <RefreshCw className="w-5 h-5 mr-3" />
                            )}
                            {isRefreshing ? "Refreshing..." : "Refresh Profile"}
                        </Button>
                    </div>



                    {/* Help Button */}
                    <div className="mb-4">
                        <Button
                            variant="ghost"
                            className="w-full h-12 rounded-xl border border-border/50 justify-start px-4 text-base font-medium"
                            onClick={() => navigate("/student/help")}
                        >
                            <AlertCircle className="w-5 h-5 mr-3 text-primary" />
                            Help & Support
                        </Button>
                    </div>

                    {/* Logout Button */}
                    <Button
                        onClick={handleLogout}
                        variant="outline"
                        className="w-full h-12 rounded-xl text-base font-semibold"
                    >
                        <LogOut className="w-5 h-5 mr-2" />
                        Logout
                    </Button>
                </div>
            </PageShell>
            <StudentBottomNav />
        </>
    );
};

export default StudentProfile;
