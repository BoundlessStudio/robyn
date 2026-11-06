import { z } from "zod";

export const uuid = z.uuid().transform(value => value.toLowerCase());
export const assetRef = z.strictObject({ assetId: uuid, revisionId: uuid });
export const pageFields = { query: z.string().max(160).optional(), cursor: z.string().max(400).optional() };
const path = z.string().min(1).max(1024);
const jsonObject = z.record(z.string(), z.unknown());

export const craftRequest = z.strictObject({
  projectId: uuid.describe("An active project from list_projects."),
  operationId: uuid.describe("A new UUID for this action. Retry the same UUID with identical arguments after an interruption."),
  inputs: z.array(assetRef).max(12).default([]).describe("Exact saved inputs. Use $input0, $input1, etc. for their working master paths."),
  textFiles: z.array(z.strictObject({
    path: path.describe("Relative to the scripts/ folder. For example, actions.json is passed as scripts/actions.json."),
    content: z.union([z.string().max(65536), jsonObject, z.array(z.unknown())]),
  })).max(8).default([]).describe("Optional text or JSON command files. In JSON values, exact $inputN strings resolve to working paths."),
  commands: z.array(z.strictObject({
    argv: z.array(z.union([z.string().max(65536), jsonObject])).min(1).max(100)
      .describe('The application’s argv without an executable. Start with ["--help"]. Objects become JSON arguments. Use $inputN as a whole path argument.'),
  })).min(1).max(8).describe("Run in order in one isolated working copy. Execution stops at the first failed command."),
  returnFiles: z.array(path).max(4).default([]).describe("Return small command exports from these working paths. Total bytes must fit within 128 KiB."),
  save: z.strictObject({
    path: path.describe("Path to the actual native master written by the app, or $inputN when the app saved into that working copy."),
    name: z.string().trim().min(1).max(160).optional().describe("Name for a new library asset."),
    inputIndex: z.number().int().min(0).max(11).optional().describe("To continue an asset, use the index of its exact base revision in inputs."),
    message: z.string().max(1000).optional(),
    projectFiles: z.array(path).max(199).optional().describe("MatCraft only. Exact linked source and numeric files in the working copy."),
    derivedFiles: z.array(z.strictObject({ path, role: z.enum(["preview", "export"]) })).max(20).optional(),
  }).optional().describe("Publish one confirmed native revision after all commands succeed."),
});
export type CraftRequest = z.infer<typeof craftRequest>;

export const craftWorkerResult = z.strictObject({
  outcome: z.enum(["completed", "failed", "interrupted"]),
  commands: z.array(z.strictObject({
    exitCode: z.number().int().nullable(),
    stdout: z.string().max(16000),
    stderr: z.string().max(4000),
    truncated: z.boolean(),
  })).max(8).default([]),
  error: z.string().max(1000).optional(),
  preview: z.object({ mimeType: z.literal("image/png"), data: z.base64().max(524288) }).optional(),
  exports: z.array(z.strictObject({ path, data: z.base64().max(174764) })).max(4).optional(),
});
