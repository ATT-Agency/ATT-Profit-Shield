"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { TellerSyncData } from "@/lib/plaid-types";

export type TellerConnection = {
  connected: boolean;
  loading: boolean;
  institutionName: string | null;
  accessToken: string | null;
  tellerData: TellerSyncData | null;
  markConnected: (accessToken: string, institutionName: string | null) => void;
  setTellerData: (data: TellerSyncData) => void;
  setLoading: (v: boolean) => void;
  syncTellerData: (token: string) => Promise<void>;
  reset: () => void;
};

const SS_TOKEN_KEY = "teller_auth_token";
const SS_INST_KEY = "teller_inst_name";
const SS_DATA_KEY = "teller_sync_data";

const Ctx = createContext<TellerConnection | null>(null);

export function TellerConnectionProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [institutionName, setInstitutionName] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tellerData, setTellerDataState] = useState<TellerSyncData | null>(null);

  const setTellerData = useCallback((data: TellerSyncData) => {
    setTellerDataState(data);
    try {
      sessionStorage.setItem(SS_DATA_KEY, JSON.stringify(data));
    } catch {
      // ignore quota / disabled-storage failures
    }
  }, []);

  const syncTellerData = useCallback(
    async (token: string): Promise<void> => {
      setLoading(true);
      try {
        const res = await fetch("/api/teller/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: token }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Sync failed (${res.status})`);
        }
        const data = (await res.json()) as TellerSyncData;
        setTellerData(data);
      } finally {
        setLoading(false);
      }
    },
    [setTellerData]
  );

  const markConnected = useCallback(
    (token: string, institution: string | null) => {
      setAccessToken(token);
      setInstitutionName(institution);
      setConnected(true);
      try {
        sessionStorage.setItem(SS_TOKEN_KEY, token);
        sessionStorage.setItem(SS_INST_KEY, institution ?? "");
      } catch {
        // ignore quota / disabled-storage failures
      }
    },
    []
  );

  const reset = useCallback(() => {
    setConnected(false);
    setAccessToken(null);
    setInstitutionName(null);
    setTellerDataState(null);
    setLoading(false);
    try {
      sessionStorage.removeItem(SS_TOKEN_KEY);
      sessionStorage.removeItem(SS_INST_KEY);
      sessionStorage.removeItem(SS_DATA_KEY);
    } catch {
      // ignore quota / disabled-storage failures
    }
  }, []);

  // Restore session on mount — tab lifetime only (sessionStorage evicted on
  // close). If cached sync data is present, hydrate from it immediately so
  // screens render without a refetch; otherwise pull fresh data for the token.
  useEffect(() => {
    try {
      const token = sessionStorage.getItem(SS_TOKEN_KEY);
      if (!token) return;
      const inst = sessionStorage.getItem(SS_INST_KEY) || null;
      setAccessToken(token);
      setInstitutionName(inst);
      setConnected(true);

      const cachedRaw = sessionStorage.getItem(SS_DATA_KEY);
      if (cachedRaw) {
        try {
          setTellerDataState(JSON.parse(cachedRaw) as TellerSyncData);
          return; // skip refetch — cached snapshot is good for this tab
        } catch {
          sessionStorage.removeItem(SS_DATA_KEY);
        }
      }

      syncTellerData(token).catch((e) =>
        console.warn("[Teller] session restore failed:", e)
      );
    } catch {
      // sessionStorage unavailable (e.g. private-mode restrictions)
    }
  }, [syncTellerData]);

  const value = useMemo<TellerConnection>(
    () => ({
      connected,
      loading,
      institutionName,
      accessToken,
      tellerData,
      markConnected,
      setTellerData,
      setLoading,
      syncTellerData,
      reset,
    }),
    [connected, loading, institutionName, accessToken, tellerData, markConnected, setTellerData, syncTellerData, reset]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTellerConnection(): TellerConnection {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useTellerConnection must be used inside <TellerConnectionProvider>"
    );
  }
  return ctx;
}

// Backwards-compatible aliases.
export const PlaidConnectionProvider = TellerConnectionProvider;
export const usePlaidConnection = useTellerConnection;
export type PlaidConnection = TellerConnection;
