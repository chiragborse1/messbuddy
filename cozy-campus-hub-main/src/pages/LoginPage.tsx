import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase, getProfile } from "@/lib/supabase";

const LoginPage = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginAs, setLoginAs] = useState<"student" | "admin">("student");
  const [credentials, setCredentials] = useState({
    email: "",
    password: "",
  });

  const handleModeChange = (mode: "student" | "admin") => {
    setLoginAs(mode);
    // Optional: clear credentials or set defaults
    // setCredentials({ email: "", password: "" });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) throw error;

      if (data.session) {
        const profile = await getProfile(data.session.user.id);

        if (!profile) {
          throw new Error("User profile not found. Please contact support.");
        }

        // Enforce role match with selected tab
        if (loginAs === "admin" && profile.role !== "admin" && profile.role !== "developer") {
          await supabase.auth.signOut();
          throw new Error("Access Denied: You are not an admin.");
        }

        if (loginAs === "student" && profile.role !== "student") {
          await supabase.auth.signOut();
          throw new Error("Access Denied: You are an Admin/Developer. Please use the Admin tab.");
        }

        if (profile.role === "admin" || profile.role === "developer") {
          navigate("/admin");
        } else {
          // Check student status
          if (profile.status === "pending") {
            await supabase.auth.signOut();
            toast({
              title: "Account Pending",
              description: "Your account is awaiting admin approval.",
              variant: "destructive",
            });
            return; // Stop execution — don't navigate anywhere
          } else if (profile.status === "rejected" || profile.status === "suspended") {
            await supabase.auth.signOut();
            toast({
              title: profile.status === "suspended" ? "Account Suspended" : "Account Rejected",
              description: "Try contacting admin",
              variant: "destructive",
            });
            return; // Stop execution
          } else {
            // Active/Approved
            navigate("/student");
          }
        }
      }
    } catch (error: any) {
      console.error(error);
      const message = error.message || "Invalid credentials";
      const isNotConfirmed = message.toLowerCase().includes("email not confirmed") ||
        message.toLowerCase().includes("not confirmed");
      toast({
        title: isNotConfirmed ? "Email Not Verified" : "Login Failed",
        description: isNotConfirmed
          ? "Please check your inbox and click the verification link we sent you before logging in."
          : message,
        variant: "destructive",
      });
      if (error.message?.includes("Access Denied")) {
        navigate("/");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!credentials.email) {
      toast({ title: "Enter your email first", description: "Type your email address above, then click Forgot Password.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(credentials.email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) throw error;
      toast({ title: "Reset email sent! 📬", description: "Check your inbox for a password reset link." });
    } catch (error: any) {
      toast({ title: "Failed to send", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-2xl overflow-hidden mb-4 shadow-md">
            <img src="/Krishna Logo.png" alt="MessBuddy Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold">Kanhaiya Mess</h1>
          <p className="text-sm text-muted-foreground mt-1">Your mess, managed.</p>
        </div>

        <div className="flex bg-muted rounded-xl p-1 mb-6">
          <button
            type="button"
            onClick={() => handleModeChange("student")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${loginAs === "student"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            Student
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("admin")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${loginAs === "admin"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            Admin
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              className="h-12 rounded-xl"
              value={credentials.email}
              onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="h-12 rounded-xl pr-12"
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
              >
                Forgot password?
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 rounded-xl text-base font-semibold"
            disabled={loading}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : `Log In as ${loginAs === "admin" ? "Admin" : "Student"}`}
          </Button>
        </form>

        {loginAs === "student" && (
          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{" "}
            <button
              onClick={() => navigate("/signup")}
              className="text-primary font-semibold hover:underline"
            >
              Sign Up
            </button>
          </p>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
