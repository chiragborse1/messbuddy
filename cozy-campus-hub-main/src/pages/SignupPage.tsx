import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Camera, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { MESS_PLANS } from "@/lib/plans";
import { validateImageFile } from "@/lib/uploads";

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
    isExistingMember: false,
    requestedPlan: "",
    requestedPlanStartDate: "",
    hasPendingAmount: false,
    pendingAmount: "0",
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const validation = validateImageFile(file, { maxSizeMB: 5 });

    if (validation.ok === false) {
      toast({ title: "Invalid profile photo", description: validation.error, variant: "destructive" });
      e.target.value = "";
      return;
    }

    if (photoPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(photoPreview);
    }

    setPhotoFile(validation.file);
    setPhotoPreview(URL.createObjectURL(validation.file));
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

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const buildSignupNotification = () => ({
    eventType: 'student_signup' as const,
    targetRole: 'admin' as const
  });

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
          data: {
            name: formData.name,
            mobile: formData.mobile,
            college: formData.college,
            course: formData.course,
            role: 'student',
            status: 'pending',
            requested_plan: formData.isExistingMember ? formData.requestedPlan : null,
            requested_plan_start_date: formData.isExistingMember ? formData.requestedPlanStartDate : null,
            requested_pending_amount: formData.isExistingMember && formData.hasPendingAmount ? Number(formData.pendingAmount) : 0
          }
        }
      });

      if (error) throw error;
      if (!data.user) throw new Error("User creation failed");

      // Note: All profile details (name, college, plan, etc.) are now 
      // automatically synced by the database trigger from the signup metadata.

      if (photoFile) {
        if (data.session) {
          const photoUrl = await uploadPhoto(data.user.id, photoFile);
          if (photoUrl) {
            await supabase.from('profiles').update({ photo_url: photoUrl }).eq('id', data.user.id);
          }
        } else {
          const fileExt = photoFile.name.split('.').pop() || "jpg";
          localStorage.setItem(`pending_avatar_${data.user.id}`, await fileToDataUrl(photoFile));
          localStorage.setItem(`pending_avatar_ext_${data.user.id}`, fileExt);
        }
      }

      const signupNotification = buildSignupNotification();
      if (data.session) {
        void supabase.functions.invoke('send-notification', {
          body: signupNotification
        });
      } else {
        localStorage.setItem(`pending_signup_notice_${data.user.id}`, JSON.stringify(signupNotification));
      }

      await supabase.auth.signOut();
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
        <h2 className="text-xl font-bold mb-2">Request Submitted! 🎉</h2>
        <p className="text-sm text-muted-foreground text-center mb-2 max-w-xs">
          Your account has been created for <span className="font-semibold text-foreground">{formData.email}</span>.
        </p>
        <p className="text-sm text-muted-foreground text-center mb-8 max-w-xs">
          Your account is pending admin approval. You'll be able to log in once the admin activates your account.
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
              autoComplete="name"
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
              autoComplete="tel"
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
              autoComplete="email"
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
              autoComplete="new-password"
              className="h-12 rounded-xl"
              required
              minLength={6}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>
        </div>

        {/* Existing Member Toggle */}
        <div className="bg-muted/30 p-4 rounded-2xl border border-secondary/20 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold cursor-pointer" htmlFor="existing-member">
              Are you already a Mess Member?
            </Label>
            <input
              id="existing-member"
              type="checkbox"
              checked={formData.isExistingMember}
              onChange={(e) => setFormData({ ...formData, isExistingMember: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
            />
          </div>

          {formData.isExistingMember && (
            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="requestedPlan" className="text-sm font-medium">Previous Plan</Label>
                  <select
                    id="requestedPlan"
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    value={formData.requestedPlan}
                    onChange={(e) => setFormData({ ...formData, requestedPlan: e.target.value })}
                    required={formData.isExistingMember}
                  >
                    <option value="">Select Plan</option>
                    {MESS_PLANS.map((plan) => (
                      <option key={plan.id} value={plan.label}>
                        {plan.label} (₹{plan.price})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requestedPlanStartDate" className="text-sm font-medium">Start Date</Label>
                  <Input
                    id="requestedPlanStartDate"
                    type="date"
                    value={formData.requestedPlanStartDate}
                    onChange={(e) => setFormData({ ...formData, requestedPlanStartDate: e.target.value })}
                    required={formData.isExistingMember}
                  />
                </div>
              </div>

              {/* New Pending Amount Fields */}
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Any Pending Balance?</Label>
                    <p className="text-[10px] text-muted-foreground">Select if you have an unpaid amount</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, hasPendingAmount: !formData.hasPendingAmount })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${formData.hasPendingAmount ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${formData.hasPendingAmount ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {formData.hasPendingAmount && (
                  <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <Label htmlFor="pendingAmount" className="text-sm font-medium text-orange-600">Enter Pending Amount (₹)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">₹</span>
                      <Input
                        id="pendingAmount"
                        type="number"
                        placeholder="e.g. 500"
                        className="pl-7"
                        value={formData.pendingAmount}
                        onChange={(e) => setFormData({ ...formData, pendingAmount: e.target.value })}
                        required={formData.hasPendingAmount}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
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
