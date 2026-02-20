import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const AuthCallback = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [errorMsg, setErrorMsg] = useState("");

    useEffect(() => {
        // Supabase automatically exchanges the token from the URL hash.
        // We listen for the auth state change to confirm it worked.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === "SIGNED_IN" && session) {
                // Sign them out so they go through the normal login flow
                await supabase.auth.signOut();
                setStatus("success");
            } else if (event === "TOKEN_REFRESHED") {
                await supabase.auth.signOut();
                setStatus("success");
            }
        });

        // Also handle the case where the URL has an error (e.g. expired link)
        const hash = window.location.hash;
        if (hash.includes("error=")) {
            const params = new URLSearchParams(hash.replace("#", "?"));
            setErrorMsg(params.get("error_description") || "The verification link is invalid or has expired.");
            setStatus("error");
        }

        // Fallback: if no event fires after 5s, show error
        const timeout = setTimeout(() => {
            setStatus((prev) => (prev === "loading" ? "error" : prev));
            setErrorMsg("Verification timed out. The link may have expired. Please try signing up again.");
        }, 5000);

        return () => {
            subscription.unsubscribe();
            clearTimeout(timeout);
        };
    }, []);

    if (status === "loading") {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center px-6">
                <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground text-sm">Verifying your email...</p>
            </div>
        );
    }

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
