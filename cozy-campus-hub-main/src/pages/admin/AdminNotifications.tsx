import { useCallback, useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import AdminBottomNav from "@/components/AdminBottomNav";
import { Button } from "@/components/ui/button";
import {
    Send,
    Check,
    Loader2,
    Utensils,
    AlertCircle,
    History,
    ArrowLeft,
    MessageSquare,
    Image as ImageIcon,
    Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { validateImageFile } from "@/lib/uploads";
import { fetchFeaturedMenuItems } from "@/lib/menuQueries";

interface NotificationLog {
    id: string;
    sender_id: string | null;
    title: string;
    body: string;
    image: string | null;
    target_role: string | null;
    topic: string | null;
    user_ids: string[] | null;
    sent_count: number;
    success_count: number;
    error_count: number;
    created_at: string;
}

let cachedNotificationHistory: NotificationLog[] | null = null;

const getFunctionErrorMessage = async (error: any) => {
    if (!error) return "Unknown error occurred";

    try {
        const context = error.context;
        if (context && typeof context.json === "function") {
            const body = await context.json();
            if (body?.error) return body.error;
        }
    } catch {
        // Fall back to the client error message below.
    }

    return error.message || "Unknown error occurred";
};

const formatDateTime = (value: string) =>
    new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
    });

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
    const [historyItems, setHistoryItems] = useState<NotificationLog[]>(cachedNotificationHistory ?? []);
    const [historyLoading, setHistoryLoading] = useState(false);

    const fetchHistory = useCallback(async (silent = false) => {
        const showInitialLoader = !silent && !cachedNotificationHistory;
        if (showInitialLoader) setHistoryLoading(true);
        try {
            const { data, error } = await supabase
                .from('notification_logs')
                .select('id, sender_id, title, body, image, target_role, topic, user_ids, sent_count, success_count, error_count, created_at')
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            cachedNotificationHistory = (data || []) as NotificationLog[];
            setHistoryItems(cachedNotificationHistory);
        } catch (error: any) {
            if (!silent) {
                toast({ title: "Failed to load history", description: error.message, variant: "destructive" });
            }
        } finally {
            if (showInitialLoader) setHistoryLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === "history") {
            fetchHistory();
        }
    }, [activeTab, fetchHistory]);

    useEffect(() => {
        const channel = supabase
            .channel('notification_logs_realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'notification_logs' },
                () => fetchHistory(true)
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchHistory]);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const validation = validateImageFile(file, { maxSizeMB: 5 });

        if (validation.ok === false) {
            toast({ title: "Invalid image", description: validation.error, variant: "destructive" });
            e.target.value = "";
            return;
        }

        if (photoPreview?.startsWith("blob:")) {
            URL.revokeObjectURL(photoPreview);
        }

        setPhotoFile(validation.file);
        setPhotoPreview(URL.createObjectURL(validation.file));
        setImageUrl(""); // Clear manual URL if file is selected
    };

    const clearPhotoSelection = () => {
        if (photoPreview?.startsWith("blob:")) {
            URL.revokeObjectURL(photoPreview);
        }
        setPhotoFile(null);
        setPhotoPreview(null);
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
        if (type === "custom" && (!title.trim() || !message.trim())) {
            toast({ title: "Incomplete", description: "Please enter both title and message.", variant: "destructive" });
            return;
        }

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

        const finalTitle = type === "custom" ? title : (type === "meal" ? "🍱 Meal is READY!" : "📢 Mess Update");
        let finalBody = type === "custom" ? message : (type === "meal" ? "Food is served and hot! Come enjoy your lunch/dinner." : "The mess is now open for students.");

        // Auto-fetch menu for meal ready notifications
        if (type === "meal") {
            try {
                const menuItems = await fetchFeaturedMenuItems(undefined, 3);

                if (menuItems.length > 0) {
                    const menuText = menuItems.map(i => i.item.name).join(", ");
                    finalBody = `Today's Special: ${menuText}. Come and get it!`;
                    // Use the first item's image as the notification thumbnail
                    if (menuItems[0].item.image_url) {
                        finalImage = menuItems[0].item.image_url;
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

        try {
            const { data, error } = await supabase.functions.invoke('send-notification', {
                body: payload
            });

            if (error) {
                throw new Error(await getFunctionErrorMessage(error));
            }

            const sentCount = data?.successCount ?? data?.count ?? 0;
            toast({
                title: "Notification Sent!",
                description: `${sentCount} device${sentCount === 1 ? "" : "s"} accepted it.`,
            });
            if (type === "custom") {
                setTitle("");
                setMessage("");
                setImageUrl("");
                clearPhotoSelection();
            }
            void fetchHistory(true);
        } catch (error: any) {
            let errorMessage = error.message || "Unknown error occurred";

            // If it's a Supabase error object, it might be stringified JSON
            if (errorMessage.includes('{"error":')) {
                try {
                    const parsed = JSON.parse(errorMessage.substring(errorMessage.indexOf('{')));
                    if (parsed.error) errorMessage = parsed.error;
                } catch {
                    // Keep the original Supabase error message if parsing fails.
                }
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
                                className="bg-card border border-border/50 p-4 rounded-2xl text-left hover:bg-muted/50 transition-colors"
                            >
                                <Utensils className="w-6 h-6 text-primary mb-2" />
                                <p className="font-bold text-foreground text-sm">Meal Ready</p>
                                <p className="text-[10px] text-muted-foreground">Fires "Food is hot" alert</p>
                            </button>
                            <button
                                onClick={() => sendNotification("mess")}
                                className="bg-card border border-border/50 p-4 rounded-2xl text-left hover:bg-muted/50 transition-colors"
                            >
                                <Check className="w-6 h-6 text-primary mb-2" />
                                <p className="font-bold text-foreground text-sm">Mess Open</p>
                                <p className="text-[10px] text-muted-foreground">Quick serving alert</p>
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
                                            onClick={clearPhotoSelection}
                                            className="w-12 h-12 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive hover:bg-destructive/15"
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

                        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex gap-3">
                            <AlertCircle className="w-5 h-5 text-primary shrink-0" />
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                                <b>Pro Tip:</b> Use announcements sparingly to keep students engaged. Avoid sending late at night unless it's an emergency.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3 animate-slide-up">
                        {historyLoading ? (
                            <div className="flex justify-center py-16">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        ) : historyItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                                <History className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-sm">No notification history yet.</p>
                                <p className="text-[10px] mt-1">Sent broadcasts will appear here after the function logs them.</p>
                            </div>
                        ) : (
                            historyItems.map((item) => {
                                const hasErrors = item.error_count > 0;
                                return (
                                    <div key={item.id} className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-foreground truncate">{item.title}</p>
                                                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                                            </div>
                                            {item.image && (
                                                <img
                                                    src={item.image}
                                                    alt=""
                                                    className="w-12 h-12 rounded-xl object-cover border border-border/50"
                                                    loading="lazy"
                                                />
                                            )}
                                        </div>
                                        <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-muted-foreground">
                                            <span className="rounded-full bg-muted px-2 py-1">
                                                {item.topic || item.target_role || `${item.user_ids?.length || 0} selected`}
                                            </span>
                                            <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                                                Sent {item.success_count}/{item.sent_count}
                                            </span>
                                            {hasErrors && (
                                                <span className="rounded-full bg-destructive/10 px-2 py-1 text-destructive">
                                                    {item.error_count} failed
                                                </span>
                                            )}
                                            <span className="ml-auto">{formatDateTime(item.created_at)}</span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </PageShell>
            <AdminBottomNav />
        </>
    );
};

export default AdminNotifications;
