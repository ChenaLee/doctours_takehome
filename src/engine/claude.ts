import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type LlmCaller = (system: string, user: string) => Promise<string>;

export function createClaudeCaller(): LlmCaller {
  return async (system: string, user: string): Promise<string> => {
    const { stdout } = await execFileAsync(
      "claude",
      ["--print", "--output-format", "text", "-s", system, user],
      { maxBuffer: 4 * 1024 * 1024 },
    );
    return stdout.trim();
  };
}
