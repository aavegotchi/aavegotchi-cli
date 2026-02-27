import { z } from "zod";

const addressSchema = z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Expected an EVM address")
    .transform((value) => value.toLowerCase() as `0x${string}`);

export const signerSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("readonly") }),
    z.object({ type: z.literal("env"), envVar: z.string().regex(/^[A-Z_][A-Z0-9_]*$/) }),
    z.object({ type: z.literal("keychain"), accountId: z.string().min(1) }),
    z.object({ type: z.literal("ledger"), derivationPath: z.string().optional() }),
    z.object({
        type: z.literal("remote"),
        url: z.string().url(),
        address: addressSchema.optional(),
        authEnvVar: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional(),
    }),
]);

export const policySchema = z.object({
    name: z.string().min(1),
    maxValueWei: z.string().regex(/^\d+$/).optional(),
    maxGasLimit: z.string().regex(/^\d+$/).optional(),
    maxFeePerGasWei: z.string().regex(/^\d+$/).optional(),
    maxPriorityFeePerGasWei: z.string().regex(/^\d+$/).optional(),
    allowedTo: z.array(addressSchema).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

export const profileSchema = z.object({
    name: z.string().min(1),
    chain: z.string().min(1),
    chainId: z.number().int().positive(),
    rpcUrl: z.string().url(),
    signer: signerSchema,
    policy: z.string().min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

export const cliConfigSchema = z.object({
    schemaVersion: z.literal(2),
    activeProfile: z.string().optional(),
    profiles: z.record(profileSchema),
    policies: z.record(policySchema),
});

export const legacyCliConfigSchema = z.object({
    schemaVersion: z.literal(1),
    activeProfile: z.string().optional(),
    profiles: z.record(
        z.object({
            name: z.string(),
            chain: z.string(),
            chainId: z.number(),
            rpcUrl: z.string(),
            signer: z.any(),
            policy: z.string(),
            createdAt: z.string(),
            updatedAt: z.string(),
        }),
    ),
});

export const batchStepSchema = z.object({
    id: z.string().min(1),
    command: z.string().min(1),
    dependsOn: z.array(z.string()).optional(),
    args: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
    continueOnError: z.boolean().optional(),
});

export const batchPlanSchema = z.object({
    version: z.literal(1),
    profile: z.string().optional(),
    mode: z.enum(["agent", "human"]).optional(),
    continueOnError: z.boolean().optional(),
    steps: z.array(batchStepSchema).min(1),
});

export type BatchPlan = z.infer<typeof batchPlanSchema>;
