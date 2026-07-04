"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Role as DbRole } from "@/lib/database.types";
import type { Role, User } from "@/lib/auth-types";

function toAppRole(dbRole: DbRole): Role {
  return dbRole === "STUDENT" ? "student" : "teacher";
}

// Supabase-backed session hook. Used when SUPABASE_ENABLED is true.
export function useSupabaseSession(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function loadProfile(userId: string, email: string) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, role")
        .eq("id", userId)
        .single();
      if (!active) return;
      if (profile) {
        const name =
          `${profile.first_name} ${profile.last_name}`.trim() || email;
        setUser({
          id: userId,
          email,
          name,
          role: toAppRole(profile.role),
        });
      } else {
        setUser({ id: userId, email, name: email, role: "student" });
      }
      setLoading(false);
    }

    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (!active) return;
      if (authUser) loadProfile(authUser.id, authUser.email ?? "");
      else {
        setUser(null);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) loadProfile(session.user.id, session.user.email ?? "");
      else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

export async function supabaseLogout(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}
