import { CliError } from "./errors";
import { PolicyConfig } from "./types";

interface TxPolicyCheckInput {
    policy: PolicyConfig;
    to: `0x${string}`;
    valueWei?: bigint;
    gasLimit?: bigint;
    maxFeePerGasWei?: bigint;
    maxPriorityFeePerGasWei?: bigint;
}

function exceeds(limit: string | undefined, current: bigint | undefined): boolean {
    if (!limit || current === undefined) {
        return false;
    }

    return current > BigInt(limit);
}

export function enforcePolicy(input: TxPolicyCheckInput): void {
    const violations: string[] = [];

    if (input.policy.allowedTo && input.policy.allowedTo.length > 0) {
        const normalized = input.to.toLowerCase();
        const allowed = input.policy.allowedTo.map((value) => value.toLowerCase());

        if (!allowed.includes(normalized)) {
            violations.push(`to address '${input.to}' is not allowlisted by policy '${input.policy.name}'`);
        }
    }

    if (exceeds(input.policy.maxValueWei, input.valueWei)) {
        violations.push(`value exceeds maxValueWei (${input.policy.maxValueWei})`);
    }

    if (exceeds(input.policy.maxGasLimit, input.gasLimit)) {
        violations.push(`gas limit exceeds maxGasLimit (${input.policy.maxGasLimit})`);
    }

    if (exceeds(input.policy.maxFeePerGasWei, input.maxFeePerGasWei)) {
        violations.push(`max fee per gas exceeds maxFeePerGasWei (${input.policy.maxFeePerGasWei})`);
    }

    if (exceeds(input.policy.maxPriorityFeePerGasWei, input.maxPriorityFeePerGasWei)) {
        violations.push(
            `max priority fee per gas exceeds maxPriorityFeePerGasWei (${input.policy.maxPriorityFeePerGasWei})`,
        );
    }

    if (violations.length > 0) {
        throw new CliError("POLICY_VIOLATION", "Transaction blocked by policy checks.", 2, {
            policy: input.policy.name,
            violations,
        });
    }
}
