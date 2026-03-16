import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'super_admin' | 'admin' | 'partner' | 'callcenter' | 'customer' | 'cc_broker';

interface Profile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  partner_number: string | null;
  role: AppRole;
  roles: AppRole[];
  status: 'pending' | 'active' | 'suspended' | 'cancelled';
  promotion_code: string | null;
  domain: string | null;
  sponsor_id: string | null;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string, retries = 3, delayMs = 1000): Promise<Profile | null> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.error(`Error fetching profile (attempt ${attempt}/${retries}):`, error);
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          }
          return null;
        }

        if (!data) {
          console.warn(`No profile found for user ${userId} (attempt ${attempt}/${retries})`);
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          }
          return null;
        }

        // Fetch promotion code from promotion_codes table
        let promotionCode: string | null = null;
        const { data: promoData } = await supabase
          .from('promotion_codes')
          .select('code')
          .eq('partner_id', data.id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        promotionCode = promoData?.code || null;

        // Fetch additional roles from user_roles table
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', data.id);

        const dbRoles = (rolesData || []).map((r: any) => r.role as AppRole);
        const primaryRole = (data.role || 'customer') as AppRole;
        // Merge primary role + user_roles, deduplicate
        const allRoles = Array.from(new Set([primaryRole, ...dbRoles])) as AppRole[];

        return {
          ...data,
          role: primaryRole,
          roles: allRoles,
          promotion_code: promotionCode,
        } as Profile;
      } catch (err) {
        console.error(`Error in fetchProfile (attempt ${attempt}/${retries}):`, err);
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        return null;
      }
    }
    return null;
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer profile fetch with setTimeout to avoid deadlocks
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id).then(setProfile);
          }, 0);
        } else {
          setProfile(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id).then((p) => {
          setProfile(p);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error: error ? new Error(error.message) : null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });
      return { error: error ? new Error(error.message) : null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore signout errors (e.g., expired session, 403)
    }
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) {
      const p = await fetchProfile(user.id);
      setProfile(p);
    }
  };

  const hasRole = (role: AppRole): boolean => {
    if (!profile) return false;
    // super_admin has access to everything
    if (profile.roles.includes('super_admin')) return true;
    return profile.roles.includes(role);
  };

  const hasAnyRole = (roles: AppRole[]): boolean => {
    if (!profile) return false;
    if (profile.roles.includes('super_admin')) return true;
    return roles.some(r => profile.roles.includes(r));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        hasRole,
        hasAnyRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
