import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
// [FIXED] Changed to CDN import to avoid module resolution errors in this environment
import { createClient } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import logo from "../components/ui/marhaba logo1.svg"


// Initialize Supabase client
import { supabase } from '@/lib/supabaseClient';

export default function VerifyOtp() {
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth(); // Removed verifyOtp from destructuring if it's not in context, using local logic or assuming it's passed

  // Mock verifyOtp function if not in context (adjust based on your actual AuthContext)
  const verifyOtp = async (email: string, token: string) => {
      const { data, error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: 'email',
      })
      if (error) return false;
      return true;
  }

  useEffect(() => {
    const pending = localStorage.getItem("pending_otp_email");
    if (!pending) {
      // In a real app, redirect to login. For this preview, we'll just log it.
      console.log("No pending email found");
      // window.location.href = "/login"; 
    } else {
      setEmail(pending);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return setError("Enter 6-digit OTP");

    setLoading(true);
    const success = await verifyOtp(email, otp);
    setLoading(false);

    if (!success) {
      setError("Invalid OTP");
    } else {
        // Handle successful verification
        alert("Verification Successful!");
        window.location.href = "/";
    }
  };

  const resendOtp = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (!error) alert("OTP resent!");
  };

  return (
    <div className="min-h-screen bg-black dark:bg-black font-['Inter',_sans-serif] flex flex-col">
      
      {/* --- ADDED HEADER SECTION --- */}
      <header className="container flex h-40 items-center justify-between relative w-full">
        <div className="container mx-auto px-6 flex h-24 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <img src={logo} alt="Marhaba AI Logo" className="h-36 w-auto" />
          </Link>
        </div>
        {/* Gradient Line */}
        <div className="absolute bottom-0 left-0 w-full h-px bg-[linear-gradient(to_right,transparent,rgba(255,255,255,0.5),transparent)]" aria-hidden="true" />
      </header>

      {/* --- MAIN CONTENT --- */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 dark:bg-black dark:border dark:border-white/20">
          <h1 className="text-2xl font-bold text-center mb-2 text-black dark:text-white">
            Enter OTP
          </h1>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
            Code sent to <strong>{email || "your email"}</strong>
          </p>

          <form onSubmit={handleSubmit}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="w-full text-center text-3xl tracking-widest bg-white border-2 border-black rounded-md p-4 mb-4 text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white dark:focus:ring-purple-500 dark:placeholder-gray-600 transition-colors"
              placeholder="000000"
              autoFocus
            />

            {error && <p className="text-red-600 text-sm mb-4 text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-gradient-to-r from-purple-600 to-orange-500 text-white py-3 rounded-md font-medium disabled:opacity-50 hover:opacity-90 transition shadow-md hover:shadow-lg"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
          </form>

          <p className="text-center mt-4 text-sm text-gray-600 dark:text-gray-400">
            Didn’t get it?{" "}
            <button
              onClick={resendOtp}
              disabled={loading}
              className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              Resend OTP
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}