import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";
import path from "node:path";
import {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
  TASK_COMPILE_SOLIDITY_LOG_DOWNLOAD_COMPILER_END,
  TASK_COMPILE_SOLIDITY_LOG_DOWNLOAD_COMPILER_START
} from "hardhat/builtin-tasks/task-names";
import { subtask, type HardhatUserConfig } from "hardhat/config";
import { CompilerDownloader, CompilerPlatform } from "hardhat/internal/solidity/compiler/downloader";
import { getCompilersDir } from "hardhat/internal/util/global-dir";
import type { SolcBuild } from "hardhat/types/builtin-tasks/compile";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(
  async ({ quiet, solcVersion }, { run }): Promise<SolcBuild> => {
    const compilersCache = await getCompilersDir();
    const downloader = CompilerDownloader.getConcurrencySafeDownloader(
      CompilerPlatform.WASM,
      compilersCache
    );

    await downloader.downloadCompiler(
      solcVersion,
      async (isCompilerDownloaded: boolean) => {
        await run(TASK_COMPILE_SOLIDITY_LOG_DOWNLOAD_COMPILER_START, {
          solcVersion,
          isCompilerDownloaded,
          quiet
        });
      },
      async (isCompilerDownloaded: boolean) => {
        await run(TASK_COMPILE_SOLIDITY_LOG_DOWNLOAD_COMPILER_END, {
          solcVersion,
          isCompilerDownloaded,
          quiet
        });
      }
    );

    const compiler = await downloader.getCompiler(solcVersion);
    if (compiler === undefined) {
      throw new Error(`WASM build of solc ${solcVersion} is unavailable`);
    }

    return compiler;
  }
);

const deployerPrivateKey = [
  process.env.DEPLOYER_PRIVATE_KEY,
  process.env.LEGACY_EVM_PRIVATE_KEY,
  process.env.API_SIGNER_PRIVATE_KEY
].find(isValidPrivateKey);

const hasDeployConfig =
  typeof process.env.LEGACY_EVM_RPC_URL === "string" &&
  process.env.LEGACY_EVM_RPC_URL.length > 0 &&
  deployerPrivateKey !== undefined;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "cancun"
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: hasDeployConfig
    ? {
        legacyEvm: {
          url: process.env.LEGACY_EVM_RPC_URL as string,
          accounts: [normalizePrivateKey(deployerPrivateKey as string)]
        }
      }
    : {}
};

export default config;

function isValidPrivateKey(value: string | undefined) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  return /^[0-9a-fA-F]{64}$/.test(normalized);
}

function normalizePrivateKey(value: string) {
  return value.startsWith("0x") ? value : `0x${value}`;
}
