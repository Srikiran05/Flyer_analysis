import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import { Session, User } from "@supabase/supabase-js";

interface Permissions {
  can_view_dashboard?: boolean;
  can_manage_clients?: boolean;
  can_manage_users?: boolean;
  can_manage_permissions?: boolean;
  can_edit_data?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  clientId: string | null;
  userRole: string | null;
  permissions: Permissions;
  login: (email: string, password: string) => Promise<boolean>;
  verifyOtp: (email: string, token: string) => Promise<boolean>;
  logout: () => Promise<void>;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Permissions>({});
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [listenerActive, setListenerActive] = useState(true); // NEW

  // ----------------------------------------------------
  // Auth Listener — ONLY ACTIVE AFTER OTP
  // ----------------------------------------------------
  useEffect(() => {
    if (!listenerActive) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsAuthenticated(!!session);
        setLoading(false);

        if (session?.user) {
          await fetchAndStoreClientUserId(session.user.email!);
          await loadUserProfile(session.user.email!);
        } else {
          setClientId(null);
          setUserRole(null);
          setPermissions({});
          localStorage.removeItem("user");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !localStorage.getItem("pending_otp_email")) {
        setSession(session);
        setUser(session.user);
        setIsAuthenticated(true);
        fetchAndStoreClientUserId(session.user.email!);
        loadUserProfile(session.user.email!);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [listenerActive]);

  // ----------------------------------------------------
  // Fetch client_users.id
  // ----------------------------------------------------
  const fetchAndStoreClientUserId = async (email: string) => {
    try {
      const { data, error } = await supabase
        .from("client_users")
        .select("id, email")
        .eq("email", email)
        .single();

      if (error && error.code !== "PGRST116") return;

      if (data) {
        localStorage.setItem("user", JSON.stringify({ id: data.id, email: data.email }));
      }
    } catch (err) {
      console.error("Client fetch error:", err);
    }
  };

  const loadUserProfile = async (email: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", email)
      .single();

    if (!error && data) {
      setClientId(data.client_id);
      setUserRole(data.role);
      setPermissions({
        can_view_dashboard: data.can_view_dashboard,
        can_manage_clients: data.can_manage_clients,
        can_manage_users: data.can_manage_users,
        can_manage_permissions: data.can_manage_permissions,
        can_edit_data: data.can_edit_data,
      });
    }
  };

  // ----------------------------------------------------
  // 1. LOGIN: Password → Send OTP (NO LISTENER)
  // ----------------------------------------------------
  const login = async (email: string, password: string): Promise<boolean> => {
    setListenerActive(false); // DISABLE LISTENER

    // Validate password
    const { error: pwdError } = await supabase.auth.signInWithPassword({ email, password });
    if (pwdError) {
      setListenerActive(true);
      return false;
    }

    // Destroy session
    await supabase.auth.signOut();

    // Send OTP
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    setListenerActive(true); // RE-ENABLE

    if (error) return false;

    localStorage.setItem("pending_otp_email", email);
    return true;
  };

  // ----------------------------------------------------
  // 2. VERIFY OTP → FINAL LOGIN
  // ----------------------------------------------------
  const verifyOtp = async (email: string, token: string): Promise<boolean> => {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error || !data?.user) return false;

    const authUser = data.user;
    setUser(authUser);
    setIsAuthenticated(true);
    localStorage.removeItem("pending_otp_email");

    await fetchAndStoreClientUserId(authUser.email!);
    await loadUserProfile(authUser.email!);
    return true;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAuthenticated(false);
    localStorage.clear();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        clientId,
        userRole,
        permissions,
        login,
        verifyOtp,
        logout,
        loading,
        isAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};