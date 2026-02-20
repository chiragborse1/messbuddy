import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, Loader2, XCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

// Helper: base64 data URL → Blob
const dataURLtoBlob = (dataUrl: string): Blob => {
    const [header, base64] = dataUrl.split(",");
    const mimeString = header.split(":")[1].split(";")[0];
    const byteString = atob(base64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    return new Blob([ab], { type: mimeString });
};

// Upload pending profile photo stored during signup
const uploadPendingAvatar = async (userId: string) => {
    const pendingPhoto = localStorage.getItem(`pending_avatar_${userId}`);
    const ext = localStorage.getItem(`pending_avatar_ext_${userId}`) || "jpg";
    if (!pendingPhoto) return;
    try {
        const blob = dataURLtoBlob(pendingPhoto);
        const filePath = `${userId}.${ext}`;
        const { error } = await supabase.storage.from("avatars").upload(filePath, blob, { upsert: true });
        if (!error) {
            const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
            await supabase.from("profiles").update({ photo_url: data.publicUrl }).eq("id", userId);
        }
        localStorage.removeItem(`pending_avatar_${userId}`);
        localStorage.removeItem(`pending_avatar_ext_${userId}`);
    } catch (err) {
        console.warn("Pending avatar upload failed:", err);
    }
};

const AuthCallback = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState<"loading" | "success" | "error" | "reset_password">("loading");
    const [errorMsg, setErrorMsg] = useState("");
    // Password reset state
    const [newPassword, setNewPassword] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [resetting, setResetting] = useState(false);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === "PASSWORD_RECOVERY") {
                // Show the set-new-password form (session is active)
                setStatus("reset_password");
                return;
            }

            if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
                // Upload pending profile photo if stored during signup
                await uploadPendingAvatar(session.user.id);
                // Sign out so student goes through normal login
                await supabase.auth.signOut();
                setStatus("success");
            }
        });

        // Handle URL errors (expired / invalid link)
        const hash = window.location.hash;
        if (hash.includes("error=")) {
            const params = new URLSearchParams(hash.replace("#", "?"));
            setErrorMsg(params.get("error_description") || "The verification link is invalid or has expired.");
            setStatus("error");
        }

        // Fallback timeout
        const timeout = setTimeout(() => {
            setStatus((prev) => {
                if (prev === "loading") {
                    setErrorMsg("Verification timed out. The link may have expired. Please try again.");
                    return "error";
                }
                return prev;
            });
        }, 6000);

        return () => { subscription.unsubscribe(); clearTimeout(timeout); };
    }, []);

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword.length < 6) {
            toast({ title: "Too short", description: "Password must be at least 6 characters.", variant: "destructive" });
            return;
        }
        setResetting(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            await supabase.auth.signOut();
            toast({ title: "Password Updated! ✅", description: "You can now log in with your new password." });
            navigate("/");
        } catch (err: any) {
            toast({ title: "Reset Failed", description: err.message, variant: "destructive" });
        } finally {
            setResetting(false);
        }
    };

    // Loading
    if (status === "loading") {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center px-6">
                <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground text-sm">Verifying your email...</p>
            </div>
        );
    }

    // Error
    if (status === "error") {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
                <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
                    <XCircle className="w-10 h-10 text-destructive" />
                </div>
                <h2 className="text-xl font-bold mb-2">Verification Failed</h2>
                <p className="text-sm text-muted-foreground mb-8 max-w-xs">
                    {errorMsg || "The verification link is invalid or has expired. Please sign up again."}
                </p>
                <Button onClick={() => navigate("/signup")} className="rounded-xl w-full max-w-xs">
                    Back to Sign Up
                </Button>
            </div>
        );
    }

    // Password Reset Form
    if (status === "reset_password") {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center px-6">
                <div className="w-full max-w-sm">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="w-8 h-8 text-primary" />
                        </div>
                        <h2 className="text-2xl font-bold">Set New Password</h2>
                        <p className="text-sm text-muted-foreground mt-1">Enter your new password below</p>
                    </div>
                    <form onSubmit={handlePasswordReset} className="space-y-4">
                        <div className="space-y-2">
                            <Label>New Password</Label>
                            <div className="relative">
                                <Input
                                    type={showPw ? "text" : "password"}
                                    placeholder="Minimum 6 characters"
                                    className="h-12 rounded-xl pr-12"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPw(!showPw)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                        <Button type="submit" className="w-full h-12 rounded-xl font-semibold" disabled={resetting}>
                            {resetting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Update Password"}
                        </Button>
                    </form>
                </div>
            </div>
        );
    }

    // Success
    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">Email Verified! 🎉</h2>
            <p className="text-sm text-muted-foreground mb-8 max-w-xs">
                Your email has been confirmed. You can now log in. Your account will be active after admin approval.
            </p>
            <Button onClick={() => navigate("/")} className="rounded-xl w-full max-w-xs">
                Go to Login
            </Button>
        </div>
    );
};

export default AuthCallback;
