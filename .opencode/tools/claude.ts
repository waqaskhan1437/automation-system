import { tool } from "@opencode-ai/plugin"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export default tool({
  description: "Ask Claude AI for free (via Puter.js)",
  args: {
    prompt: tool.schema.string().describe("Question to ask Claude AI"),
  },
  async execute(args, context) {
    const toolDir = context.worktree || context.directory
    const result = await execAsync(`node "${toolDir}/puter-ai.js" "${args.prompt}"`, {
      cwd: toolDir,
      timeout: 60000,
    })
    return result.stdout || result.stderr
  },
})