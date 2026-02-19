import PageShell from "@/components/PageShell";
import StudentBottomNav from "@/components/StudentBottomNav";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { User, Mail, Phone, GraduationCap, Building2, LogOut, Camera, AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

const StudentProfile = () => {
    const { user, logout, updateUser, refreshProfile } = useUser();
    const navigate = useNavigate();
    const [photoPreview, setPhotoPreview] = useState<string | null>(user?.photo || null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    const handleLogout = () => {
        logout();
        navigate("/");
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        const minTime = new Promise(resolve => setTimeout(resolve, 1000));
        await Promise.all([refreshProfile(), minTime]);
        setIsRefreshing(false);
    };

    const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        // Show local preview immediately
        const localPreview = URL.createObjectURL(file);
        setPhotoPreview(localPreview);
        setUploadingPhoto(true);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/avatar.${fileExt}`;

            // Upload to Supabase Storage (avatars bucket)
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, file, { upsert: true });

            if (uploadError) throw uploadError;

            // Get the permanent public URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(fileName);

            // Persist the URL to the profiles table
            const { error: dbError } = await supabase
                .from('profiles')
                .update({ photo_url: publicUrl })
                .eq('id', user.id);

            if (dbError) throw dbError;

            setPhotoPreview(publicUrl);
            toast({ title: "Photo Updated", description: "Your profile photo has been saved." });
        } catch (error: any) {
            console.error("Photo upload error:", error);
            toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
            // Revert preview on failure
            setPhotoPreview(user.photo || null);
        } finally {
            setUploadingPhoto(false);
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
                        <label className="relative cursor-pointer group">
                            <div className="w-32 h-32 rounded-3xl bg-muted flex items-center justify-center overflow-hidden border-4 border-border">
                                {photoPreview ? (
                                    <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-16 h-16 text-muted-foreground" />
                                )}
                                {/* Upload overlay */}
                                <div className="absolute inset-0 bg-black/40 rounded-3xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    {uploadingPhoto
                                        ? <Loader2 className="w-8 h-8 text-white animate-spin" />
                                        : <Camera className="w-8 h-8 text-white" />
                                    }
                                </div>
                            </div>
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handlePhotoChange}
                                disabled={uploadingPhoto}
                            />
                        </label>
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
