#!/usr/bin/env node
import { execFileSync, spawn } from "child_process";
const child = spawn(
  "/Users/mobio/.bun/bin/bun",
  ["run", "/Users/mobio/MD2LD/src/mcp-server.ts"],
  { stdio: "inherit", env: process.env }
);
child.on("exit", (code) => process.exit(code ?? 0));
