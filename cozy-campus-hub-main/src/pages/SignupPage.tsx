import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Camera, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

const SignupPage = () => {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    email: "",
    college: "",
    course: "",
    password: "",
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const uploadPhoto = async (userId: string, file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.warn("Photo upload failed:", uploadError);
      return null;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!photoFile) {
      toast({
        title: "Profile Photo Required",
        description: "Please upload a profile photo to continue.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            name: formData.name,
            mobile: formData.mobile,
            college: formData.college,
            course: formData.course,
            role: 'student',
            status: 'pending'
          }
        }
      });

      if (error) throw error;

      // Store photo in localStorage so AuthCallback can upload it after email verification
      if (photoFile && data.user) {
        const reader = new FileReader();
        reader.onloadend = () => {
          localStorage.setItem(`pending_avatar_${data.user!.id}`, reader.result as string);
          localStorage.setItem(`pending_avatar_ext_${data.user!.id}`, (photoFile.name.split('.').pop() || 'jpg'));
        };
        reader.readAsDataURL(photoFile);
      }

      setSubmitted(true);
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Signup Failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-xl font-bold mb-2">Check Your Email 📬</h2>
        <p className="text-sm text-muted-foreground text-center mb-2 max-w-xs">
          We sent a verification link to <span className="font-semibold text-foreground">{formData.email}</span>.
        </p>
        <p className="text-sm text-muted-foreground text-center mb-8 max-w-xs">
          Click the link in the email to verify your account, then come back here to log in. After that, your account will be reviewed by an admin.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button variant="default" onClick={() => navigate("/")} className="rounded-xl w-full">
            Go to Login
          </Button>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen pb-8">
      <header className="flex items-center gap-3 px-5 pt-12 pb-4">
        <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Create Account</h1>
      </header>

      <form onSubmit={handleSubmit} className="px-5 space-y-4 animate-fade-in">

        {/* Photo Upload Section */}
        <div className="flex justify-center mb-2">
          <label className="relative cursor-pointer group">
            <div className={`w-24 h-24 rounded-2xl bg-muted flex items-center justify-center overflow-hidden border-2 border-dashed ${!photoFile ? 'border-primary' : 'border-border'} group-hover:border-primary/50 transition-colors shadow-sm`}>
              {photoPreview ? (
                <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handlePhotoChange} required />
            <span className="text-xs text-muted-foreground block text-center mt-2 font-medium">
              {photoPreview ? "Change Photo" : "Upload Photo *"}
            </span>
          </label>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input
              placeholder="John Doe"
              className="h-12 rounded-xl"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Mobile Number</Label>
            <Input
              placeholder="+91 98765 43210"
              type="tel"
              className="h-12 rounded-xl"
              required
              value={formData.mobile}
              onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              placeholder="john@college.edu"
              type="email"
              className="h-12 rounded-xl"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>College Name</Label>
              <Input
                placeholder="ABC College"
                className="h-12 rounded-xl"
                required
                value={formData.college}
                onChange={(e) => setFormData({ ...formData, college: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Course</Label>
              <Input
                placeholder="B.Tech"
                className="h-12 rounded-xl"
                required
                value={formData.course}
                onChange={(e) => setFormData({ ...formData, course: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input
              placeholder="Create a password"
              type="password"
              className="h-12 rounded-xl"
              required
              minLength={6}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-12 rounded-xl text-base font-semibold mt-4 shadow-md bg-primary hover:bg-primary/90"
          disabled={loading}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign Up"}
        </Button>
      </form>
    </div>
  );
};

export default SignupPage;
