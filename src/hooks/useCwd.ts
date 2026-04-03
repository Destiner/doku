import { useCwdContext } from "../contexts/CwdContext";

export function useCwd(): string | null {
  return useCwdContext().cwd;
}
