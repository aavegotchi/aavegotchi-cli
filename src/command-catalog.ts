import { listMappedCommands } from "./commands/mapped";
import { listDomainStubRoots } from "./commands/stubs";

const BUILTIN_COMMANDS = [
    "help",
    "bootstrap",
    "profile list",
    "profile show",
    "profile use",
    "profile export",
    "signer check",
    "signer keychain list",
    "signer keychain import",
    "signer keychain remove",
    "policy list",
    "policy show",
    "policy upsert",
    "rpc check",
    "tx send",
    "tx status",
    "tx resume",
    "tx watch",
    "batch run",
    "onchain call",
    "onchain send",
    "subgraph list",
    "subgraph check",
    "subgraph query",
    "baazaar listing get",
    "baazaar listing active",
    "baazaar listing mine",
    "auction get",
    "auction active",
    "auction mine",
    "auction bids",
    "auction bids-mine",
] as const;

function listDomainReadCommands(): string[] {
    return listDomainStubRoots().map((root) => `${root} read`);
}

function levenshteinDistance(a: string, b: string): number {
    if (a === b) {
        return 0;
    }

    if (a.length === 0) {
        return b.length;
    }

    if (b.length === 0) {
        return a.length;
    }

    const previous = new Array(b.length + 1).fill(0).map((_, index) => index);
    const current = new Array(b.length + 1).fill(0);

    for (let i = 1; i <= a.length; i++) {
        current[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min(
                current[j - 1] + 1,
                previous[j] + 1,
                previous[j - 1] + substitutionCost,
            );
        }

        for (let j = 0; j <= b.length; j++) {
            previous[j] = current[j];
        }
    }

    return previous[b.length];
}

export function listKnownCommands(): string[] {
    return [
        ...BUILTIN_COMMANDS,
        ...listDomainReadCommands(),
        ...listMappedCommands(),
    ];
}

export function suggestCommands(input: string, max = 5): string[] {
    const query = input.trim().toLowerCase();
    if (!query) {
        return [];
    }

    const scored = listKnownCommands().map((command) => {
        const normalized = command.toLowerCase();
        const startsWith = normalized.startsWith(query);
        const includes = normalized.includes(query);
        const distance = levenshteinDistance(query, normalized);
        let score = distance;
        if (startsWith) {
            score = 0;
        } else if (includes) {
            score = Math.min(score, 1);
        }

        return { command, score };
    });

    scored.sort((a, b) => {
        if (a.score !== b.score) {
            return a.score - b.score;
        }
        return a.command.localeCompare(b.command);
    });

    const threshold = Math.max(2, Math.floor(query.length / 2) + 1);
    const filtered = scored.filter((entry) => entry.score <= threshold);
    const results = (filtered.length > 0 ? filtered : scored).slice(0, max).map((entry) => entry.command);
    return [...new Set(results)];
}
