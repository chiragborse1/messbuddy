import { motion, useMotionValue, useTransform, useAnimation, PanInfo } from "framer-motion";
import { Check, X, ExternalLink, User } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface PaymentSwipeCardProps {
    payment: any;
    onSwipe: (id: number, direction: 'left' | 'right') => void;
    onImageClick?: (url: string) => void;
    className?: string;
    style?: React.CSSProperties;
}

export const PaymentSwipeCard = ({ payment, onSwipe, onImageClick, className, style }: PaymentSwipeCardProps) => {
    const [exitX, setExitX] = useState<number | null>(null);
    const x = useMotionValue(0);
    const scale = useTransform(x, [-150, 0, 150], [0.5, 1, 0.5]);
    const rotate = useTransform(x, [-150, 0, 150], [-45, 0, 45], { clamp: false });

    // Opacity regarding swipe direction
    const opacityLeft = useTransform(x, [-100, 0], [1, 0]); // Left swipe accepts
    const opacityRight = useTransform(x, [0, 100], [0, 1]); // Right swipe rejects

    const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (info.offset.x < -100) {
            setExitX(-200);
            onSwipe(payment.id, 'left'); // Left accepts
        } else if (info.offset.x > 100) {
            setExitX(200);
            onSwipe(payment.id, 'right'); // Right rejects
        }
    };

    return (
        <motion.div
            style={{
                x,
                rotate,
                ...style,
            }}
            className={`absolute w-full max-w-sm h-[500px] bg-card rounded-3xl shadow-xl border-border/50 border overflow-hidden cursor-grab active:cursor-grabbing select-none ${className}`}
            drag={true}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            onDragEnd={handleDragEnd}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, x: exitX ? exitX : 0 }}
            exit={{ x: exitX !== null ? exitX : 0, opacity: 0, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
            {/* Overlay Indicators */}
            <motion.div
                style={{ opacity: opacityLeft }}
                className="absolute top-8 right-8 z-20 pointer-events-none"
            >
                <div className="border-4 border-green-500 rounded-lg px-4 py-2 transform rotate-12">
                    <span className="text-green-500 font-bold text-3xl tracking-widest uppercase">ACCEPT</span>
                </div>
            </motion.div>

            <motion.div
                style={{ opacity: opacityRight }}
                className="absolute top-8 left-8 z-20 pointer-events-none"
            >
                <div className="border-4 border-red-500 rounded-lg px-4 py-2 transform -rotate-12">
                    <span className="text-red-500 font-bold text-3xl tracking-widest uppercase">REJECT</span>
                </div>
            </motion.div>

            {/* Card Content */}
            <div className="h-full flex flex-col">
                {/* Photo Header */}
                <div
                    className="relative h-3/5 bg-muted cursor-pointer group"
                    onClick={(e) => {
                        e.stopPropagation(); // Prevent drag interference
                        if (payment.screenshot_url && onImageClick) onImageClick(payment.screenshot_url);
                    }}
                    onPointerDownCapture={(e) => e.stopPropagation()}
                >
                    {payment.screenshot_url ? (
                        <>
                            <img
                                src={payment.screenshot_url}
                                alt="Payment Screenshot"
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                draggable={false}
                            />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <ExternalLink className="w-8 h-8 text-white drop-shadow-lg" />
                            </div>
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-zinc-800 text-muted-foreground">
                            <span className="text-sm italic">No screenshot provided</span>
                        </div>
                    )}

                    <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden border border-white/30">
                                {payment.profiles?.photo_url ? (
                                    <img src={payment.profiles.photo_url} className="w-full h-full object-cover" draggable={false} />
                                ) : (
                                    <User className="w-5 h-5 text-white" />
                                )}
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-lg drop-shadow-md">{payment.profiles?.name || "Unknown User"}</h3>
                                <p className="text-white/80 text-xs drop-shadow-md">{payment.profiles?.college || "No College Info"}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Details Footer */}
                <div className="flex-1 p-5 bg-card flex flex-col gap-3 justify-center relative pointer-events-none">
                    {/* Gradient Check/Cross Icons to reinforce direction */}
                    <div className="absolute left-4 top-[-1.5rem] bg-white dark:bg-zinc-900 rounded-full p-2 shadow-lg border border-border">
                        <X className="w-6 h-6 text-red-500" />
                    </div>
                    <div className="absolute right-4 top-[-1.5rem] bg-white dark:bg-zinc-900 rounded-full p-2 shadow-lg border border-border">
                        <Check className="w-6 h-6 text-green-500" />
                    </div>

                    <div className="mt-2 space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground font-medium">Plan</span>
                            <Badge variant="outline" className="text-sm">{payment.plan_name}</Badge>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground font-medium">Amount</span>
                            <span className="text-xl font-bold">₹{payment.amount}</span>
                        </div>

                        {/* Validity Dates */}
                        <div className="flex justify-between items-center py-1 border-t border-border/50 border-dashed">
                            <span className="text-xs text-muted-foreground font-medium">Validity</span>
                            <div className="text-right">
                                <span className="text-xs font-semibold block">
                                    {(() => {
                                        try {
                                            const startStr = payment.membership_start_date || payment.created_at;
                                            if (!startStr) return "N/A";
                                            const start = new Date(startStr);
                                            if (isNaN(start.getTime())) return "Invalid Date";
                                            const end = new Date(start);
                                            const isMonthly = payment.plan_name?.toLowerCase().includes('monthly');
                                            if (isMonthly) end.setMonth(end.getMonth() + 1);
                                            else end.setDate(end.getDate() + 1);
                                            const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                                            return `${fmt(start)} - ${fmt(end)}`;
                                        } catch (e) { return "Date Error"; }
                                    })()}
                                </span>
                            </div>
                        </div>

                        {/* Membership Start Date */}
                        <div className="flex justify-between items-center py-1 border-t border-border/50 border-dashed">
                            <span className="text-xs text-muted-foreground font-medium">Start Date</span>
                            <span className="text-xs font-semibold">
                                {(() => {
                                    try {
                                        if (!payment.membership_start_date) return "Not Specified";
                                        const d = new Date(payment.membership_start_date);
                                        if (isNaN(d.getTime())) return "Invalid Date";
                                        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                                    } catch (e) { return "Date Error"; }
                                })()}
                            </span>
                        </div>

                        {payment.transaction_id && (
                            <div className="flex justify-between items-center pt-2 border-t border-border/50">
                                <span className="text-xs text-muted-foreground">Txn ID</span>
                                <span className="text-xs font-mono">{payment.transaction_id}</span>
                            </div>
                        )}
                    </div>

                    <div className="mt-auto text-center">
                        <p className="text-xs text-muted-foreground/60">Swipe LEFT to Accept • RIGHT to Reject</p>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
