import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { ReactNode } from "react";

interface CwdContextValue {
  cwd: string | null;
  cwdVersion: number;
  switchProject: (path: string) => Promise<boolean>;
}

const CwdContext = createContext<CwdContextValue>({
  cwd: null,
  cwdVersion: 0,
  switchProject: async () => false,
});

export function CwdProvider({ children }: { children: ReactNode }) {
  const [cwd, setCwd] = useState<string | null>(null);
  const [cwdVersion, setCwdVersion] = useState(0);

  useEffect(() => {
    fetch("/api/cwd")
      .then((r) => r.json())
      .then((data: { cwd: string }) => setCwd(data.cwd))
      .catch(() => {});
  }, [cwdVersion]);

  const switchProject = useCallback(async (path: string): Promise<boolean> => {
    const res = await fetch("/api/cwd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (res.ok) {
      setCwdVersion((v) => v + 1);
      return true;
    }
    return false;
  }, []);

  return (
    <CwdContext.Provider value={{ cwd, cwdVersion, switchProject }}>
      {children}
    </CwdContext.Provider>
  );
}

export function useCwdContext() {
  return useContext(CwdContext);
}
