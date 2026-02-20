import * as React from "react";
import { cn } from "@/lib/utils";

// --- SVG Icons ---

const CheckCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
);

const UPIIcon = () => (
    <svg viewBox="0 0 60 24" width="48" height="20" xmlns="http://www.w3.org/2000/svg">
        <text x="0" y="18" fontFamily="Arial" fontWeight="bold" fontSize="18" fill="#6B21A8">UPI</text>
    </svg>
);

// --- Helper Components ---

const DashedLine = () => (
    <div className="w-full border-t-2 border-dashed border-border" aria-hidden="true" />
);

const Barcode = ({ value }: { value: string }) => {
    const hashCode = (s: string) =>
        s.split("").reduce((a, b) => {
            a = (a << 5) - a + b.charCodeAt(0);
            return a & a;
        }, 0);
    const seed = hashCode(value);
    const random = (s: number) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
    };
    const bars = Array.from({ length: 60 }).map((_, i) => ({
        width: random(seed + i) > 0.7 ? 2.5 : 1.5,
    }));
    const spacing = 1.5;
    const totalWidth = bars.reduce((acc, bar) => acc + bar.width + spacing, 0) - spacing;
    const svgWidth = 250;
    const svgHeight = 70;
    let currentX = (svgWidth - totalWidth) / 2;
    return (
        <div className="flex flex-col items-center py-2">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width={svgWidth}
                height={svgHeight}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                aria-label={`Barcode for ${value}`}
                className="fill-current text-foreground"
            >
                {bars.map((bar, i) => {
                    const x = currentX;
                    currentX += bar.width + spacing;
                    return <rect key={i} x={x} y="10" width={bar.width} height="50" />;
                })}
            </svg>
            <p className="text-xs text-muted-foreground tracking-[0.2em] mt-2 font-mono">{value}</p>
        </div>
    );
};

const ConfettiExplosion = () => {
    const colors = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#8b5cf6", "#f97316"];
    return (
        <>
            <style>{`
        @keyframes fall {
          0%   { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
            <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
                {Array.from({ length: 80 }).map((_, i) => (
                    <div
                        key={i}
                        className="absolute w-2 h-4"
                        style={{
                            left: `${Math.random() * 100}%`,
                            top: `${-20 + Math.random() * 10}%`,
                            backgroundColor: colors[i % colors.length],
                            transform: `rotate(${Math.random() * 360}deg)`,
                            animation: `fall ${2.5 + Math.random() * 2.5}s ${Math.random() * 2}s linear forwards`,
                        }}
                    />
                ))}
            </div>
        </>
    );
};

// --- Main Ticket Props ---

export interface MessReceiptProps extends React.HTMLAttributes<HTMLDivElement> {
    receiptId: string;       // Short payment ID
    planName: string;        // e.g. "Boys Monthly"
    amount: number;          // e.g. 2200
    studentName: string;     // Student's name
    upiId: string;           // UPI ID used for payment
    paymentDate: Date;       // Date of payment submission
    barcodeValue: string;    // Full payment UUID as barcode
    showConfetti?: boolean;
}

const MessReceiptTicket = React.forwardRef<HTMLDivElement, MessReceiptProps>(
    (
        { className, receiptId, planName, amount, studentName, upiId, paymentDate, barcodeValue, showConfetti = true, ...props },
        ref
    ) => {
        const [confettiActive, setConfettiActive] = React.useState(false);

        React.useEffect(() => {
            if (!showConfetti) return;
            const t1 = setTimeout(() => setConfettiActive(true), 100);
            const t2 = setTimeout(() => setConfettiActive(false), 6000);
            return () => { clearTimeout(t1); clearTimeout(t2); };
        }, [showConfetti]);

        const formattedAmount = new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0,
        }).format(amount);

        const formattedDate = new Intl.DateTimeFormat("en-IN", {
            day: "numeric", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: true,
        }).format(paymentDate);

        return (
            <>
                {confettiActive && <ConfettiExplosion />}
                <div
                    ref={ref}
                    className={cn(
                        "relative w-full max-w-sm bg-card text-card-foreground rounded-2xl shadow-lg font-sans z-10",
                        "animate-in fade-in-0 zoom-in-95 duration-500",
                        className
                    )}
                    {...props}
                >
                    {/* Ticket notch cutouts */}
                    <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background" />
                    <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background" />

                    {/* Header */}
                    <div className="p-8 flex flex-col items-center text-center">
                        <div className="p-3 bg-green-100 rounded-full">
                            <CheckCircleIcon className="w-10 h-10 text-green-600" />
                        </div>
                        <h1 className="text-2xl font-bold mt-4">Payment Approved!</h1>
                        <p className="text-muted-foreground mt-1 text-sm">
                            Your mess membership has been activated
                        </p>
                    </div>

                    {/* Body */}
                    <div className="px-8 pb-8 space-y-5">
                        <DashedLine />

                        {/* Plan + Amount */}
                        <div className="grid grid-cols-2 gap-4 text-left">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Plan</p>
                                <p className="font-semibold">{planName}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Amount</p>
                                <p className="font-bold text-lg text-green-600">{formattedAmount}</p>
                            </div>
                        </div>

                        {/* Receipt ID + Date */}
                        <div className="grid grid-cols-2 gap-4 text-left">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Receipt No.</p>
                                <p className="font-mono font-medium text-sm">{receiptId}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Date</p>
                                <p className="text-sm font-medium">{formattedDate}</p>
                            </div>
                        </div>

                        {/* Student + UPI row */}
                        <div className="bg-muted/50 p-4 rounded-xl flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                                <span className="text-purple-700 font-bold text-sm">
                                    {studentName.charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold truncate">{studentName}</p>
                                <p className="text-muted-foreground font-mono text-xs truncate">{upiId}</p>
                            </div>
                            <UPIIcon />
                        </div>

                        <DashedLine />

                        {/* Barcode */}
                        <Barcode value={barcodeValue} />

                        {/* Footer note */}
                        <p className="text-center text-[10px] text-muted-foreground">
                            Kanhaiya Mess · Keep this receipt for your records
                        </p>
                    </div>
                </div>
            </>
        );
    }
);

MessReceiptTicket.displayName = "MessReceiptTicket";
export { MessReceiptTicket };
