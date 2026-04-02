import { useEffect, useState } from "react";

export function useCwd(): string | null {
  const [cwd, setCwd] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cwd")
      .then((r) => r.json())
      .then((data: { cwd: string }) => setCwd(data.cwd))
      .catch(() => {});
  }, []);

  return cwd;
}
