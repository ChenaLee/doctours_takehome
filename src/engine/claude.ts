import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

export type LlmCaller = (system: string, user: string) => Promise<string>;

export function createClaudeCaller(): LlmCaller {
  return async (system: string, user: string): Promise<string> => {
    const dir = mkdtempSync(join(tmpdir(), "doctours-"));
    const promptFile = join(dir, "system.txt");
    writeFileSync(promptFile, system, "utf-8");
    try {
      const { stdout } = await execFileAsync(
        "claude",
        ["--print", "--output-format", "text", "--system-prompt-file", promptFile, user],
        { maxBuffer: 4 * 1024 * 1024 },
      );
      return stdout.trim();
    } finally {
      try { unlinkSync(promptFile); } catch {}
    }
  };
}
