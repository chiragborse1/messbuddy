import { useState } from "react";
import PageShell from "@/components/PageShell";
import AdminBottomNav from "@/components/AdminBottomNav";
import { Button } from "@/components/ui/button";
import {
    Bell,
    Send,
    Check,
    Loader2,
    Utensils,
    AlertCircle,
    History,
    ArrowLeft,
    MessageSquare,
    Camera,
    Image as ImageIcon,
    Trash2,
    X
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

const AdminNotifications = () => {
    const navigate = useNavigate();
    const [title, setTitle] = useState("");
    const [message, setMessage] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<"send" | "history">("send");

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
            setImageUrl(""); // Clear manual URL if file is selected
        }
    };

    const uploadNotificationPhoto = async (file: File) => {
        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `notif_${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
            return data.publicUrl;
        } catch (error: any) {
            toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
            return null;
        } finally {
            setUploading(false);
        }
    };

    const sendNotification = async (type: "custom" | "meal" | "mess") => {
        setLoading(true);
        let finalImage = type === "custom" ? imageUrl : "";

        // Handle File Upload if exists
        if (type === "custom" && photoFile) {
            const uploadedUrl = await uploadNotificationPhoto(photoFile);
            if (!uploadedUrl) {
                setLoading(false);
                return;
            }
            finalImage = uploadedUrl;
        }

        let finalTitle = type === "custom" ? title : (type === "meal" ? "🍱 Meal is READY!" : "📢 Mess Update");
        let finalBody = type === "custom" ? message : (type === "meal" ? "Food is served and hot! Come enjoy your lunch/dinner." : message);

        // Auto-fetch menu for meal ready notifications
        if (type === "meal") {
            try {
                const { data: menuItems } = await supabase
                    .from('menu_items')
                    .select('name, image_url')
                    .neq('category', 'config')
                    .order('votes', { ascending: false })
                    .limit(3);

                if (menuItems && menuItems.length > 0) {
                    const menuText = menuItems.map(i => i.name).join(", ");
                    finalBody = `Today's Special: ${menuText}. Come and get it!`;
                    // Use the first item's image as the notification thumbnail
                    if (menuItems[0].image_url) {
                        finalImage = menuItems[0].image_url;
                    }
                }
            } catch (e) {
                console.error("Failed to fetch menu for notification:", e);
            }
        }

        const payload = {
            title: finalTitle,
            body: finalBody,
            image: finalImage,
            topic: "all_students"
        };

        if (type === "custom" && (!title.trim() || !message.trim())) {
            toast({ title: "Incomplete", description: "Please enter both title and message.", variant: "destructive" });
            return;
        }

        setLoading(true);
        try {
            console.log("🚀 Invoking Edge Function 'send-notification'...", payload);
            const { data, error } = await supabase.functions.invoke('send-notification', {
                body: payload
            });

            if (error) {
                console.error("❌ Supabase Function Error:", error);

                // Try to get detailed error from response body
                try {
                    const errorData = await error.context.json();
                    console.log("Detailed Error Data:", errorData);
                    if (errorData.error) throw new Error(errorData.error);
                } catch (e: any) {
                    if (e.message && e.message !== "[object Object]") throw e;
                }

                throw error;
            }

            console.log("✅ Function Response:", data);
            toast({ title: "Notification Sent!", description: "Students will receive it shortly." });
            if (type === "custom") {
                setTitle("");
                setMessage("");
                setImageUrl("");
                setPhotoFile(null);
                setPhotoPreview(null);
            }
        } catch (error: any) {
            console.error("💥 Notification send failed:", error);

            let errorMessage = error.message || "Unknown error occurred";

            // If it's a Supabase error object, it might be stringified JSON
            if (errorMessage.includes('{"error":')) {
                try {
                    const parsed = JSON.parse(errorMessage.substring(errorMessage.indexOf('{')));
                    if (parsed.error) errorMessage = parsed.error;
                } catch (e) { }
            }

            toast({
                title: "Failed to send",
                description: errorMessage,
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <PageShell>
                <header className="pt-12 pb-4 flex items-center gap-3">
                    <button onClick={() => navigate("/admin")} className="text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <p className="text-sm text-muted-foreground">Admin Tools</p>
                        <h1 className="text-2xl font-bold">Notifications</h1>
                    </div>
                </header>

                <div className="flex bg-muted/30 p-1 rounded-xl mb-6">
                    <button
                        onClick={() => setActiveTab("send")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'send' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                    >
                        <Send className="w-4 h-4" />
                        Send New
                    </button>
                    <button
                        onClick={() => setActiveTab("history")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                    >
                        <History className="w-4 h-4" />
                        History
                    </button>
                </div>

                {activeTab === "send" ? (
                    <div className="space-y-6 animate-slide-up">
                        {/* Quick Presets */}
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => sendNotification("meal")}
                                className="bg-blue-50 border border-blue-200 p-4 rounded-2xl text-left hover:bg-blue-100 transition-colors"
                            >
                                <Utensils className="w-6 h-6 text-blue-600 mb-2" />
                                <p className="font-bold text-blue-800 text-sm">Meal Ready</p>
                                <p className="text-[10px] text-blue-600">Fires "Food is hot" alert</p>
                            </button>
                            <button
                                onClick={() => {
                                    setMessage("The mess is now open for students.");
                                    sendNotification("mess");
                                }}
                                className="bg-green-50 border border-green-200 p-4 rounded-2xl text-left hover:bg-green-100 transition-colors"
                            >
                                <Check className="w-6 h-6 text-green-600 mb-2" />
                                <p className="font-bold text-green-800 text-sm">Mess Open</p>
                                <p className="text-[10px] text-green-600">Quick serving alert</p>
                            </button>
                        </div>

                        {/* Custom Composer */}
                        <div className="bg-card rounded-2xl border border-border/50 p-5 shadow-sm space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <MessageSquare className="w-5 h-5 text-primary" />
                                <h2 className="font-bold">Custom Broadcast</h2>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase ml-1">Title</label>
                                <input
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="e.g., Holiday Announcement"
                                    className="w-full bg-muted/50 rounded-xl p-3 text-sm border-none focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase ml-1">Message Body</label>
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Type your message here..."
                                    className="w-full bg-muted/50 rounded-xl p-3 text-sm min-h-[100px] border-none focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase ml-1">Attachment (Gallery)</label>
                                <div className="flex gap-3">
                                    <label className={`flex-1 h-12 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 cursor-pointer transition-all ${photoPreview ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                                        <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                                        {photoPreview ? (
                                            <>
                                                <Check className="w-4 h-4 text-primary" />
                                                <span className="text-sm font-medium text-primary">Image Selected</span>
                                            </>
                                        ) : (
                                            <>
                                                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                                <span className="text-sm text-muted-foreground font-medium">Choose from Gallery</span>
                                            </>
                                        )}
                                    </label>

                                    {photoPreview && (
                                        <button
                                            onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                                            className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-500 hover:bg-red-100"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                                {photoPreview && (
                                    <div className="mt-2 relative w-full aspect-video rounded-xl overflow-hidden border border-border/50">
                                        <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/20" />
                                        <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-md">
                                            Preview
                                        </div>
                                    </div>
                                )}
                            </div>

                            {!photoPreview && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-muted-foreground uppercase ml-1">Or Image URL</label>
                                    <input
                                        value={imageUrl}
                                        onChange={(e) => setImageUrl(e.target.value)}
                                        placeholder="https://example.com/image.jpg"
                                        className="w-full bg-muted/50 rounded-xl p-3 text-sm border-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                            )}

                            <Button
                                onClick={() => sendNotification("custom")}
                                disabled={loading || uploading || !title.trim() || !message.trim()}
                                className="w-full rounded-xl gap-2 mt-2"
                            >
                                {loading || uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Broadcast to All Students
                            </Button>
                        </div>

                        <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 flex gap-3">
                            <AlertCircle className="w-5 h-5 text-orange-600 shrink-0" />
                            <p className="text-[10px] text-orange-800 leading-relaxed">
                                <b>Pro Tip:</b> Use announcements sparingly to keep students engaged. Avoid sending late at night unless it's an emergency.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-slide-up">
                        <History className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-sm">Notification history coming soon.</p>
                        <p className="text-[10px] mt-1">Check your Supabase logs for details.</p>
                    </div>
                )}
            </PageShell>
            <AdminBottomNav />
        </>
    );
};

export default AdminNotifications;
