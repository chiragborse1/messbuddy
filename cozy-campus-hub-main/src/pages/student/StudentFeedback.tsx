
import { useState } from "react";
import PageShell from "@/components/PageShell";
import StudentBottomNav from "@/components/StudentBottomNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/use-toast";
import { Star, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";

const StudentFeedback = () => {
    const { user } = useUser();
    const navigate = useNavigate();
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const [submitting, setSubmitting] = useState(false);

    if (!user) {
        return null;
    }

    const handleSubmit = async () => {
        if (rating === 0) {
            toast({
                title: "Rating required",
                description: "Please select a star rating.",
                variant: "destructive",
            });
            return;
        }

        setSubmitting(true);

        try {
            const { error } = await supabase
                .from('feedback')
                .insert([
                    {
                        user_id: user.id,
                        rating: rating,
                        comment: comment,
                        category: 'food', // Default category
                    }
                ]);

            if (error) throw error;

            toast({
                title: "Feedback submitted!",
                description: "Thank you for your feedback.",
            });
            setRating(0);
            setComment("");
            navigate("/student");
        } catch (error: any) {
            console.error("Error submitting feedback:", error);
            toast({
                title: "Error",
                description: "Failed to submit feedback. Please try again.",
                variant: "destructive",
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <PageShell title="Food Feedback" subtitle="Tell us about your meal">
                <div className="pt-6 animate-slide-up space-y-6">

                    {/* Rating Section */}
                    <div className="bg-card rounded-2xl p-6 border border-border/50 shadow-sm text-center">
                        <p className="font-medium mb-4 text-lg">How was the food today?</p>
                        <div className="flex justify-center gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setRating(star)}
                                    className="focus:outline-none transition-transform hover:scale-110 active:scale-95"
                                >
                                    <Star
                                        className={`w-10 h-10 ${star <= rating
                                                ? "fill-yellow-400 text-yellow-400"
                                                : "text-muted-foreground/30"
                                            }`}
                                    />
                                </button>
                            ))}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {rating === 1 && "Very Poor"}
                            {rating === 2 && "Poor"}
                            {rating === 3 && "Average"}
                            {rating === 4 && "Good"}
                            {rating === 5 && "Excellent"}
                        </p>
                    </div>

                    {/* Comment Section */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium ml-1">Comments (Optional)</label>
                        <Textarea
                            placeholder="Share your thoughts about the taste, quality, or service..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="min-h-[120px] rounded-xl border-border/50 resize-none focus-visible:ring-primary"
                        />
                    </div>

                    {/* Submit Button */}
                    <Button
                        className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/20"
                        onClick={handleSubmit}
                        disabled={submitting}
                    >
                        {submitting ? (
                            "Submitting..."
                        ) : (
                            <>
                                <Send className="w-5 h-5 mr-2" />
                                Submit Feedback
                            </>
                        )}
                    </Button>
                </div>
            </PageShell>
            <StudentBottomNav />
        </>
    );
};

export default StudentFeedback;
