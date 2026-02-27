#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const methodsPath = path.join(root, "docs", "parity", "base-methods-base-era.txt");
const matrixPath = path.join(root, "docs", "parity", "base-command-matrix.md");

function loadMethods(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  return new Set(
    source
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

function loadMatrixMethods(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const methods = new Set();

  for (const line of source.split("\n")) {
    if (!line.startsWith("|")) {
      continue;
    }

    const cells = line.split("|").map((part) => part.trim());
    if (cells.length < 4) {
      continue;
    }

    const methodCell = cells[2];
    if (!methodCell.startsWith("`") || !methodCell.endsWith("`")) {
      continue;
    }

    methods.add(methodCell.slice(1, -1));
  }

  return methods;
}

const methods = loadMethods(methodsPath);
const matrixMethods = loadMatrixMethods(matrixPath);

const missingInMatrix = [...methods].filter((method) => !matrixMethods.has(method));
const extraInMatrix = [...matrixMethods].filter((method) => !methods.has(method));

if (missingInMatrix.length > 0 || extraInMatrix.length > 0) {
  console.error("Parity check failed.");

  if (missingInMatrix.length > 0) {
    console.error("Missing in matrix:");
    for (const method of missingInMatrix) {
      console.error(`- ${method}`);
    }
  }

  if (extraInMatrix.length > 0) {
    console.error("Extra in matrix:");
    for (const method of extraInMatrix) {
      console.error(`- ${method}`);
    }
  }

  process.exit(1);
}

console.log(`Parity check passed (${methods.size} methods).`);
