"use client";

import { create } from "zustand";
import type { UserResponse } from "@/lib/api";
import { clearToken, setToken } from "@/lib/cookies";

interface AuthState {
  user: UserResponse | null;
  isLoading: boolean;
  setUser: (user: UserResponse | null) => void;
  login: (token: string, user: UserResponse) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  setUser: (user) => set({ user, isLoading: false }),

  login: (token, user) => {
    setToken(token);
    set({ user, isLoading: false });
  },

  logout: () => {
    clearToken();
    set({ user: null, isLoading: false });
  },
}));
