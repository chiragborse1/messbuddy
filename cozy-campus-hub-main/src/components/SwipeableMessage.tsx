import React, { useRef, useState } from "react";
import { Reply } from "lucide-react";
import { cn } from "@/lib/utils";

interface SwipeableMessageProps {
    onReply: () => void;
    children: React.ReactNode;
    className?: string;
}

export const SwipeableMessage = ({
    onReply,
    children,
    className,
}: SwipeableMessageProps) => {
    const [offset, setOffset] = useState(0);
    const startX = useRef<number | null>(null);
    const threshold = 50; // Distance to trigger reply
    const iconRef = useRef<HTMLDivElement>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        startX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (startX.current === null) return;
        const currentX = e.touches[0].clientX;
        const diff = currentX - startX.current;

        // Only allow swipe right for reply (like WhatsApp)
        if (diff > 0) {
            // Apply resistance at extreme values for a "bounce" effect feel
            const resisted = diff > 100 ? 100 + (diff - 100) * 0.2 : diff;
            setOffset(resisted);
        }
    };

    const handleTouchEnd = () => {
        if (offset > threshold) {
            // Trigger reply
            if (typeof navigator !== "undefined" && navigator.vibrate) {
                navigator.vibrate(5); // Slight haptic feedback
            }
            onReply();
        }
        // Snap back
        setOffset(0);
        startX.current = null;
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        startX.current = e.clientX;
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (startX.current === null) return;
        const currentX = e.clientX;
        const diff = currentX - startX.current;

        if (diff > 0) {
            const resisted = diff > 100 ? 100 + (diff - 100) * 0.2 : diff;
            setOffset(resisted);
        }
    };

    const handleMouseUp = () => {
        if (offset > threshold) {
            onReply();
        }
        setOffset(0);
        startX.current = null;
    };

    const handleMouseLeave = () => {
        if (startX.current !== null) {
            setOffset(0);
            startX.current = null;
        }
    };

    return (
        <div
            className={cn("relative touch-pan-y select-none", className)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            style={{ touchAction: "pan-y" }} // Allow vertical scroll, capture horizontal
        >
            {/* Background Icon Layer */}
            <div
                ref={iconRef}
                className="absolute left-0 top-0 bottom-0 flex items-center justify-center p-4 transition-all duration-200 ease-out"
                style={{
                    width: "50px", // Fixed width area for icon
                    opacity: Math.min(offset / threshold, 1),
                    transform: `translateX(${Math.min(offset - 40, 0)}px) scale(${Math.min(0.5 + offset / (threshold * 2), 1)})`,
                }}
                aria-hidden="true"
            >
                <div className="bg-background/80 backdrop-blur-sm rounded-full p-2 shadow-sm border border-border/50">
                    <Reply className="w-4 h-4 text-primary" />
                </div>
            </div>

            {/* Message Content */}
            <div
                className="transform transition-transform duration-200 ease-out will-change-transform "
                style={{ transform: `translateX(${offset}px)` }}
            >
                {children}
            </div>
        </div>
    );
};

export default SwipeableMessage;
