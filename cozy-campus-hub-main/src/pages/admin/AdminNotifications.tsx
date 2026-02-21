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
    MessageSquare
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

const AdminNotifications = () => {
    const navigate = useNavigate();
    const [title, setTitle] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<"send" | "history">("send");

    const sendNotification = async (type: "custom" | "meal" | "mess") => {
        const payload = {
            title: type === "custom" ? title : (type === "meal" ? "🍱 Meal is READY!" : "📢 Mess Update"),
            body: type === "custom" ? message : (type === "meal" ? "Food is served and hot! Come enjoy your lunch/dinner." : message),
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
                throw error;
            }

            console.log("✅ Function Response:", data);
            toast({ title: "Notification Sent!", description: "Students will receive it shortly." });
            if (type === "custom") {
                setTitle("");
                setMessage("");
            }
        } catch (error: any) {
            console.error("💥 Notification send failed:", error);

            // Try to extract the custom error message we added to the Edge Function
            let errorMessage = error.message || "Unknown error occurred";

            // Check if error message is a JSON string (sometimes happens with invoke)
            try {
                const parsed = JSON.parse(error.message);
                if (parsed.error) errorMessage = parsed.error;
            } catch (e) {
                // Not JSON, use as is
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

                            <Button
                                onClick={() => sendNotification("custom")}
                                disabled={loading || !title.trim() || !message.trim()}
                                className="w-full rounded-xl gap-2 mt-2"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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
