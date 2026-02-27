import * as fs from "fs";

import { Abi } from "viem";

import { CliError } from "./errors";

type AbiFunctionItem = Extract<Abi[number], { type: "function" }>;

function normalizeTypeName(item: { type?: string; components?: readonly { type: string }[] }): string {
    if (!item.type) {
        return "unknown";
    }

    if (!item.type.includes("tuple")) {
        return item.type;
    }

    const components = item.components || [];
    const componentTypes = components.map((component) => component.type).join(",");
    return item.type.replace("tuple", `tuple(${componentTypes})`);
}

export function parseAbiFile(filePath: string): Abi {
    if (!fs.existsSync(filePath)) {
        throw new CliError("ABI_NOT_FOUND", `ABI file not found: ${filePath}`, 2);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
        throw new CliError("INVALID_ABI", `ABI file is not valid JSON: ${filePath}`, 2);
    }

    if (Array.isArray(parsed)) {
        return parsed as Abi;
    }

    if (typeof parsed === "object" && parsed !== null && "abi" in parsed && Array.isArray((parsed as { abi: unknown }).abi)) {
        return (parsed as { abi: Abi }).abi;
    }

    throw new CliError("INVALID_ABI", "ABI file must be an array or object containing 'abi'.", 2);
}

export function getAbiFunctionEntries(abi: Abi, functionName: string): AbiFunctionItem[] {
    return abi.filter(
        (item): item is AbiFunctionItem =>
            item.type === "function" && typeof item.name === "string" && item.name === functionName,
    );
}

export function formatAbiFunctionSignature(item: AbiFunctionItem): string {
    const inputTypes = (item.inputs || []).map((input) => normalizeTypeName(input));
    return `${item.name}(${inputTypes.join(",")})`;
}

export function formatAbiFunctionInputs(item: AbiFunctionItem): string[] {
    const inputs = item.inputs || [];
    if (inputs.length === 0) {
        return ["(none)"];
    }

    return inputs.map((input, index) => {
        const label = input.name ? input.name : `arg${index}`;
        return `${index}: ${label} (${normalizeTypeName(input)})`;
    });
}
