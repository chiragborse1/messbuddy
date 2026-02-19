import PageShell from "@/components/PageShell";
import AdminBottomNav from "@/components/AdminBottomNav";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { User, Mail, Phone, Building2, Shield, LogOut, Camera, Loader2, RefreshCw, PhoneCall } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

const AdminProfile = () => {
    const { user, logout, updateUser, refreshProfile } = useUser();
    const navigate = useNavigate();
    const [photoPreview, setPhotoPreview] = useState<string | null>(user?.photo || null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleLogout = () => {
        logout();
        navigate("/");
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        // Minimum spinner time for better UX
        const minTime = new Promise(resolve => setTimeout(resolve, 1000));
        await Promise.all([refreshProfile(), minTime]);
        setIsRefreshing(false);
    };

    const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        // 1. Show preview immediately
        const previewUrl = URL.createObjectURL(file);
        setPhotoPreview(previewUrl);

        try {
            setIsRefreshing(true); // Show loading state

            // 2. Upload to Supabase Storage 'avatars' bucket
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}-${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 3. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // 4. Update Profile
            await updateUser({ photo: publicUrl });

            toast({
                title: "Photo Updated",
                description: "Your profile picture has been changed.",
            });

        } catch (error: any) {
            console.error("Error uploading photo:", error);
            setPhotoPreview(user.photo || null); // Revert
            toast({
                title: "Upload Failed",
                description: error.message || "Ensure 'avatars' bucket exists and is public.",
                variant: "destructive"
            });
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
                    <h1 className="text-2xl font-bold mb-6">Admin Profile</h1>

                    {/* Profile Photo */}
                    <div className="flex justify-center mb-6">
                        <label className="relative cursor-pointer group">
                            <div className="w-32 h-32 rounded-3xl bg-muted flex items-center justify-center overflow-hidden border-4 border-border">
                                {photoPreview ? (
                                    <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <Shield className="w-16 h-16 text-muted-foreground" />
                                )}
                            </div>
                            <div className="absolute inset-0 bg-black/50 rounded-3xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera className="w-8 h-8 text-white" />
                            </div>
                            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                        </label>
                    </div>

                    {/* Admin Info Cards */}
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
                                    <p className="text-xs text-muted-foreground">Organization</p>
                                    <p className="text-sm font-semibold">Neural Service</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Shield className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Role</p>
                                    <p className="text-sm font-semibold capitalize">{user.role}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Fix Issue Button */}
                    <div className="mb-4">
                        <Button
                            variant="ghost"
                            className="w-full h-12 rounded-xl border border-border/50 justify-start px-4 text-base font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                        >
                            <Loader2 className={`w-5 h-5 mr-3 ${isRefreshing ? "animate-spin" : ""}`} />
                            {isRefreshing ? "Fixing..." : "Fix Issue / Refresh Profile"}
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
            <AdminBottomNav />
        </>
    );
};

export default AdminProfile;
