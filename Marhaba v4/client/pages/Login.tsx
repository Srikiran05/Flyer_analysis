import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Mail, Lock } from "lucide-react";
import SiteHeader from "../components/layout/SiteHeader";


export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const success = await login(email, password);
    setLoading(false);

    if (!success) return setError("Invalid email or password");
    navigate("/verify-otp", { replace: true });
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans">

      <SiteHeader />

      {/* ================================
          LOGIN FORM SECTION (centered)
      ================================= */}
      <div className="flex items-center justify-center px-4 mt-20">
        <div className="w-full max-w-md">          {/* Outer Gradient Border */}
          <div className="rounded-lg bg-gradient-to-r from-white via-white to-white p-px shadow-xl">

            {/* Inner Login Box */}
            <div className="rounded-lg bg-white p-8">

              <h1 className="text-2xl font-bold text-center mb-2 text-black">
                Welcome
              </h1>
              <p className="text-center text-gray-600 mb-8">
                Sign in to continue
              </p>

              <form onSubmit={handleSubmit} className="space-y-6">                {/* EMAIL */}
                <div>
                  <label className="text-sm text-gray-700 mb-2 block">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                    <input
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-10 py-3 text-black focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white"
                    />
                  </div>
                </div>

                {/* PASSWORD */}
                <div>
                  <label className="text-sm text-gray-700 mb-2 block">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-10 py-3 text-black focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white"
                    />
                  </div>
                </div>

                {/* ERROR */}
                {error && (
                  <div className="text-red-400 bg-red-900/20 border border-red-700 px-4 py-2 rounded-md text-center">
                    {error}
                  </div>
                )}

                {/* LOGIN BUTTON */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-md font-semibold bg-gradient-to-r from-purple-500 to-orange-500 hover:opacity-90 transition disabled:opacity-60"
                >
                  {loading ? "Sending OTP..." : "Login"}
                </button>

              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
