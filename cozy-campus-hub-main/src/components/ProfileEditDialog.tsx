import { ReactNode, useEffect, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UserData } from "@/contexts/user";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";

type EditableField = "name" | "mobile" | "college" | "course";

interface ProfileEditDialogProps {
  children: ReactNode;
  fields: EditableField[];
}

const fieldLabels: Record<EditableField, string> = {
  name: "Full Name",
  mobile: "Mobile Number",
  college: "College",
  course: "Course",
};

const fieldAutocomplete: Partial<Record<EditableField, string>> = {
  name: "name",
  mobile: "tel",
};

const ProfileEditDialog = ({ children, fields }: ProfileEditDialogProps) => {
  const { user, updateUser, refreshProfile } = useUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<EditableField, string>>({
    name: "",
    mobile: "",
    college: "",
    course: "",
  });

  useEffect(() => {
    if (!open || !user) return;

    setFormData({
      name: user.name || "",
      mobile: user.mobile || "",
      college: user.college || "",
      course: user.course || "",
    });
    setPhotoPreview(user.photo || null);
    setSelectedFile(null);
  }, [open, user]);

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid image",
        description: "Please choose a valid profile photo.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Image too large",
        description: "Please choose an image under 5 MB.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const uploadPhoto = async (userId: string, file: File) => {
    const fileExt = file.name.split(".").pop() || "jpg";
    const filePath = `${userId}.${fileExt}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (error) throw error;

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
    return `${data.publicUrl}?v=${Date.now()}`;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || saving) return;

    const updates: Partial<UserData> = {};
    fields.forEach((field) => {
      const value = formData[field].trim();
      if (value !== (user[field] || "")) {
        updates[field] = value;
      }
    });

    setSaving(true);
    try {
      if (selectedFile) {
        updates.photo = await uploadPhoto(user.id, selectedFile);
      }

      if (Object.keys(updates).length === 0) {
        toast({ title: "No changes", description: "Your profile already has these details." });
        setOpen(false);
        return;
      }

      await updateUser(updates);
      await refreshProfile(false);
      setOpen(false);
    } catch (error: any) {
      toast({
        title: "Profile update failed",
        description: error.message || "Could not save your profile.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>Update your visible profile details and photo.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex justify-center">
            <label className="relative cursor-pointer">
              <div className="w-24 h-24 rounded-2xl bg-muted flex items-center justify-center overflow-hidden border border-border">
                {photoPreview ? (
                  <img src={photoPreview} alt="Profile preview" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <span className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                <Camera className="w-4 h-4" />
              </span>
              <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoChange} />
            </label>
          </div>

          <div className="flex flex-col gap-3">
            {fields.map((field) => (
              <div key={field} className="flex flex-col gap-1.5">
                <Label htmlFor={`profile-${field}`}>{fieldLabels[field]}</Label>
                <Input
                  id={`profile-${field}`}
                  value={formData[field]}
                  autoComplete={fieldAutocomplete[field]}
                  onChange={(event) => setFormData({ ...formData, [field]: event.target.value })}
                  required={field === "name" || field === "mobile"}
                />
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileEditDialog;
