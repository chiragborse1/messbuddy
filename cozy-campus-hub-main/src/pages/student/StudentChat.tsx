import { useState, useEffect, useRef } from "react";
import PageShell from "@/components/PageShell";
import StudentBottomNav from "@/components/StudentBottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/lib/supabase";
import { Send, User as UserIcon, Image as ImageIcon, X, Download, Reply, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SwipeableMessage from "@/components/SwipeableMessage";

interface Message {
    id: string;
    content: string;
    image_url?: string;
    user_id: string;
    created_at: string;
    reply_to_id?: string | null;
    profiles?: {
        name: string;
        photo_url?: string;
    };
    reply_to?: {
        id: string;
        content: string;
        image_url?: string;
        user_id: string;
        profiles?: {
            name: string;
        }
    }
}

const StudentChat = () => {
    const { user, loading } = useUser();
    const navigate = useNavigate();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Effect to handle navigation when not loading
    useEffect(() => {
        if (!loading && !user) {
            navigate("/");
        }
    }, [user, loading, navigate]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-background text-primary">
                <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-4 border-current border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-medium">Loading chat...</p>
                </div>
            </div>
        );
    }

    if (!user) return null; // Safe fallback, though useEffect handles redirect

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, replyingTo]);

    useEffect(() => {
        const fetchMessages = async () => {
            const { data, error } = await supabase
                .from('messages')
                .select(`
                    id,
                    content,
                    image_url,
                    user_id,
                    created_at,
                    reply_to_id,
                    profiles:user_id (name, photo_url),
                    reply_to:messages!reply_to_id (
                        id,
                        content,
                        image_url,
                        user_id,
                        profiles:user_id (name)
                    )
                `)
                .order('created_at', { ascending: true });

            if (data) {
                const formattedMessages = data.map((msg: any) => ({
                    ...msg,
                    profiles: Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles,
                    reply_to: Array.isArray(msg.reply_to) ? msg.reply_to[0] : msg.reply_to
                }));

                const finalMessages = formattedMessages.map((msg: any) => {
                    if (msg.reply_to && Array.isArray(msg.reply_to.profiles)) {
                        msg.reply_to.profiles = msg.reply_to.profiles[0];
                    }
                    return msg;
                });

                setMessages(finalMessages);
            } else if (error) {
                console.error("Error fetching messages:", error);
            }
        };

        fetchMessages();

        const channel = supabase
            .channel('public_chat')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                async (payload) => {
                    const { data: fullMessageData, error: fetchError } = await supabase
                        .from('messages')
                        .select(`
                            id,
                            content,
                            image_url,
                            user_id,
                            created_at,
                            reply_to_id,
                            profiles:user_id (name, photo_url),
                            reply_to:messages!reply_to_id (
                                id,
                                content,
                                image_url,
                                user_id,
                                profiles:user_id (name)
                            )
                        `)
                        .eq('id', payload.new.id)
                        .single();

                    if (fetchError) {
                        console.error("Error fetching new message details:", fetchError);
                    }

                    if (fullMessageData) {
                        const formattedMsg = {
                            ...fullMessageData,
                            profiles: Array.isArray(fullMessageData.profiles) ? fullMessageData.profiles[0] : fullMessageData.profiles,
                            reply_to: Array.isArray(fullMessageData.reply_to) ? fullMessageData.reply_to[0] : fullMessageData.reply_to
                        };
                        if (formattedMsg.reply_to && Array.isArray(formattedMsg.reply_to.profiles)) {
                            formattedMsg.reply_to.profiles = formattedMsg.reply_to.profiles[0];
                        }

                        setMessages((prev) => [...prev, formattedMsg]);
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'messages' },
                (payload) => {
                    setMessages((prev) => prev.filter((msg) => msg.id !== payload.old.id));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.type.startsWith('image/')) {
                setSelectedFile(file);
            } else {
                alert('Please select an image file');
            }
        }
    };

    const handleRemoveFile = () => {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!newMessage.trim() && !selectedFile) || isUploading) return;

        setIsUploading(true);
        let imageUrl = null;

        try {
            if (selectedFile) {
                const fileExt = selectedFile.name.split('.').pop();
                const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('chat_images')
                    .upload(filePath, selectedFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('chat_images')
                    .getPublicUrl(filePath);

                imageUrl = publicUrl;
            }

            const { error } = await supabase
                .from('messages')
                .insert([
                    {
                        user_id: user.id,
                        content: newMessage.trim(),
                        image_url: imageUrl,
                        reply_to_id: replyingTo?.id || null
                    }
                ]);

            if (error) {
                console.error("Error sending message:", error);
            } else {
                setNewMessage("");
                handleRemoveFile();
                setReplyingTo(null);
            }
        } catch (error) {
            console.error("Error in send message flow:", error);
            alert("Failed to send message. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <>
            <PageShell
                title="Community Chat"
                subtitle={
                    <span className="flex items-center gap-1 text-orange-600 font-medium text-[10px] sm:text-xs">
                        <Clock className="w-3 h-3" /> Disappearing Messages ON (24h)
                    </span>
                }
            >
                <div className="flex flex-col h-[calc(100vh-200px)] relative">
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32 no-scrollbar">
                        {messages.map((msg) => {
                            const isMe = msg.user_id === user.id;
                            const hasImage = !!msg.image_url;
                            const hasText = !!msg.content;

                            return (
                                <SwipeableMessage
                                    key={msg.id}
                                    onReply={() => {
                                        setReplyingTo(msg);
                                    }}
                                    className="mb-1"
                                >
                                    <div
                                        id={`message-${msg.id}`}
                                        className={`flex ${isMe ? "justify-end" : "justify-start"} items-end gap-2 animate-in fade-in slide-in-from-bottom-2 group`}
                                    >
                                        {!isMe && (
                                            <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden border border-border">
                                                {msg.profiles?.photo_url ? (
                                                    <img src={msg.profiles.photo_url} alt={msg.profiles.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <UserIcon className="w-4 h-4 text-muted-foreground" />
                                                )}
                                            </div>
                                        )}

                                        <div className={`flex flex-col max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                                            <div
                                                className={`relative shadow-sm text-sm overflow-hidden ${isMe
                                                    ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-none"
                                                    : "bg-card border border-border/50 rounded-2xl rounded-tl-none"
                                                    }`}
                                            >
                                                {msg.reply_to && (
                                                    <div
                                                        onClick={() => {
                                                            const el = document.getElementById(`message-${msg.reply_to_id}`);
                                                            if (el) {
                                                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                                el.classList.add('bg-primary/5');
                                                                setTimeout(() => el.classList.remove('bg-primary/5'), 1000);
                                                            }
                                                        }}
                                                        className={`mx-1 mt-1 mb-1 p-2 rounded-lg text-xs border-l-4 cursor-pointer hover:opacity-80 transition-opacity ${isMe
                                                            ? "bg-black/20 border-white/50 text-white"
                                                            : "bg-muted border-primary text-foreground"
                                                            }`}>
                                                        <p className="font-bold mb-0.5 text-[10px] opacity-90">{msg.reply_to.profiles?.name || "Unknown"}</p>
                                                        {msg.reply_to.image_url && (
                                                            <div className="flex items-center gap-1 mb-0.5 opacity-80">
                                                                <ImageIcon className="w-3 h-3" />
                                                                <span>Photo</span>
                                                            </div>
                                                        )}
                                                        <p className="truncate line-clamp-1 opacity-80">{msg.reply_to.content || (msg.reply_to.image_url ? "" : "Deleted message")}</p>
                                                    </div>
                                                )}

                                                {!isMe && (
                                                    <p className="text-[10px] font-bold text-primary px-2.5 pt-1.5 mb-0.5 opacity-80">
                                                        {msg.profiles?.name || "Unknown"}
                                                    </p>
                                                )}
                                                {hasImage && (
                                                    <div
                                                        className={`cursor-pointer overflow-hidden ${hasText ? "mb-1" : ""}`}
                                                        onClick={() => setPreviewImage(msg.image_url!)}
                                                    >
                                                        <img
                                                            src={msg.image_url}
                                                            alt="Shared image"
                                                            className="w-full h-auto object-cover max-h-[300px] hover:scale-105 transition-transform duration-300"
                                                            loading="lazy"
                                                        />
                                                    </div>
                                                )}
                                                {hasText && (
                                                    <p className={`text-[15px] leading-snug break-words px-2.5 ${!hasImage && !isMe ? 'pt-0' : 'pt-1.5'} pb-0.5`}>
                                                        {msg.content}
                                                    </p>
                                                )}
                                                <div className="flex items-center justify-between gap-3 px-2.5 pb-1.5">
                                                    <button
                                                        onClick={() => setReplyingTo(msg)}
                                                        className={`opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full hover:bg-black/10 text-[10px] flex items-center gap-1 ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                                                        title="Reply"
                                                    >
                                                        <Reply className="w-3 h-3" />
                                                    </button>
                                                    <p className={`text-[10px] text-right ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </SwipeableMessage>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t border-border/50">
                        {replyingTo && (
                            <div className="flex items-center justify-between p-2 px-4 bg-muted/90 border-b border-border/50 animate-in slide-in-from-bottom-2">
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-xs font-bold text-primary">Replying to {replyingTo.profiles?.name || "Unknown"}</span>
                                    <span className="text-xs text-muted-foreground truncate line-clamp-1">
                                        {replyingTo.content || (replyingTo.image_url ? "Image Attachment" : "Message")}
                                    </span>
                                </div>
                                <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-background rounded-full">
                                    <X className="w-4 h-4 text-muted-foreground" />
                                </button>
                            </div>
                        )}

                        {selectedFile && (
                            <div className="flex items-center gap-2 m-2 mx-4 p-2 bg-muted/50 rounded-lg w-fit animate-in slide-in-from-bottom-2">
                                <div className="w-10 h-10 rounded overflow-hidden">
                                    <img src={URL.createObjectURL(selectedFile)} alt="Preview" className="w-full h-full object-cover" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs truncate max-w-[150px] font-medium">{selectedFile.name}</span>
                                    <span className="text-[10px] text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                                </div>
                                <button onClick={handleRemoveFile} className="ml-2 text-muted-foreground hover:text-foreground">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        <form onSubmit={handleSendMessage} className="flex gap-2 items-center p-4 pt-2">
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleFileSelect}
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="rounded-full w-10 h-10 shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <ImageIcon className="w-5 h-5" />
                            </Button>
                            <Input
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder={replyingTo ? "Type a reply..." : "Type a message..."}
                                className="flex-1 rounded-full border-border/50 bg-muted/50 focus-visible:ring-primary"
                                disabled={isUploading}
                            />
                            <Button
                                type="submit"
                                size="icon"
                                className="rounded-full w-10 h-10 shrink-0"
                                disabled={(!newMessage.trim() && !selectedFile) || isUploading}
                            >
                                {isUploading ? (
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                            </Button>
                        </form>
                    </div>
                </div>

                {previewImage && (
                    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
                        <button
                            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-black/50 rounded-full transition-colors"
                            onClick={() => setPreviewImage(null)}
                        >
                            <X className="w-6 h-6" />
                        </button>
                        <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
                            <img
                                src={previewImage}
                                alt="Full screen preview"
                                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                            />
                            <a
                                href={previewImage}
                                target="_blank"
                                rel="noreferrer"
                                className="absolute bottom-4 right-4 p-2 text-white/80 hover:text-white bg-black/50 rounded-full transition-colors opacity-0 hover:opacity-100 group-hover:opacity-100"
                                title="Open original"
                            >
                                <Download className="w-5 h-5" />
                            </a>
                        </div>
                    </div>
                )}
            </PageShell>
            <StudentBottomNav />
        </>
    );
};

export default StudentChat;
