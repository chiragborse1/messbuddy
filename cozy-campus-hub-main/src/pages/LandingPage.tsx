import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useUser } from "@/contexts/UserContext";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
    ArrowRight,
    UtensilsCrossed,
    ShieldCheck,
    Clock,
    Star,
    Users
} from "lucide-react";

const LandingPage = () => {
    const navigate = useNavigate();
    const { user, loading: authLoading } = useUser();

    useEffect(() => {
        if (!authLoading && user) {
            if (user.role === 'admin' || user.role === 'developer') {
                navigate('/admin', { replace: true });
            } else if (user.role === 'student' && user.status !== 'pending') {
                navigate('/student', { replace: true });
            }
        }
    }, [user, authLoading, navigate]);

    return (
        <div className="min-h-screen relative overflow-hidden font-sans">
            {/* Background Image with Overlay */}
            <div
                className="fixed inset-0 z-0 bg-cover bg-center transition-transform duration-1000"
                style={{
                    backgroundImage: 'url("/Entry BG.jpg")',
                    transform: 'scale(1.05)'
                }}
            >
                <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
            </div>

            {/* Content Layer */}
            <div className="relative z-10 min-h-screen flex flex-col pt-12">

                {/* Navigation Hero */}
                <header className="px-6 flex justify-between items-center animate-fade-in">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg border-2 border-white/20">
                            <img src="/Krishna Logo.png" alt="Logo" className="w-full h-full object-cover" />
                        </div>
                        <span className="text-white font-bold text-xl tracking-tight">Kanhaiya Mess</span>
                    </div>
                    <Button
                        variant="ghost"
                        className="text-white hover:bg-white/10"
                        onClick={() => navigate("/login")}
                    >
                        Login
                    </Button>
                </header>

                {/* Hero Section */}
                <main className="flex-1 flex flex-col items-center justify-start text-center px-6 pt-32 pb-20">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                        className="max-w-2xl flex flex-col items-center"
                    >

                        <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-[1.2] mb-12">
                            Healthy Meals.<br />
                            Happy Students.<br />
                            <span className="text-primary italic">Kanhaiya Mess.</span>
                        </h1>


                        <div className="flex flex-col sm:flex-row gap-4">
                            <Button
                                size="lg"
                                className="h-14 px-8 rounded-2xl text-lg font-bold group shadow-xl shadow-primary/20"
                                onClick={() => navigate("/login")}
                            >
                                Get Started
                                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </div>
                    </motion.div>
                </main>

                {/* Feature Highlights Overlay */}
                <section id="about" className="px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-8 max-w-6xl mx-auto w-full">
                    <motion.div
                        whileHover={{ y: -5 }}
                        className="p-6 rounded-3xl border border-white/20 bg-white/5 backdrop-blur-3xl shadow-xl"
                    >
                        <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
                            <UtensilsCrossed className="w-6 h-6 text-primary" />
                        </div>
                        <h3 className="text-white font-bold text-lg mb-2">Hygienic Food</h3>
                        <p className="text-white/60 text-sm">Prepared with the tightest safety standards and freshest ingredients.</p>
                    </motion.div>

                    <motion.div
                        whileHover={{ y: -5 }}
                        className="p-6 rounded-3xl border border-white/20 bg-white/5 backdrop-blur-3xl shadow-xl"
                    >
                        <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center mb-4">
                            <ShieldCheck className="w-6 h-6 text-accent" />
                        </div>
                        <h3 className="text-white font-bold text-lg mb-2">Safe Environment</h3>
                        <p className="text-white/60 text-sm">A clean and welcoming space for students to enjoy their meals.</p>
                    </motion.div>

                    <motion.div
                        whileHover={{ y: -5 }}
                        className="p-6 rounded-3xl border border-white/20 bg-white/5 backdrop-blur-3xl shadow-xl"
                    >
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4">
                            <Clock className="w-6 h-6 text-blue-400" />
                        </div>
                        <h3 className="text-white font-bold text-lg mb-2">Timely Service</h3>
                        <p className="text-white/60 text-sm">Strict adherence to lunch and dinner schedules for your busy life.</p>
                    </motion.div>
                </section>

                {/* Footer Stats / Social Proof */}
                <footer className="px-6 py-12 flex flex-col md:flex-row justify-between items-center gap-8 border-t border-white/10 mt-auto bg-black/20 backdrop-blur-xl">
                    <div className="flex gap-12">
                        <div className="text-center md:text-left">
                            <div className="text-2xl font-black text-white">500+</div>
                            <div className="text-xs text-white/50 uppercase tracking-widest font-bold">Daily Students</div>
                        </div>
                        <div className="text-center md:text-left">
                            <div className="text-2xl font-black text-white">4.9/5</div>
                            <div className="text-xs text-white/50 uppercase tracking-widest font-bold">Average Rating</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-white/40 text-xs">
                        <Users className="w-4 h-4" />
                        <span>Join the community at Kanhaiya Mess</span>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default LandingPage;
