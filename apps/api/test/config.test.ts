import assert from "node:assert/strict";
import test from "node:test";

import { getApiConfig } from "../src/config";

const baseEnv = {
  CHAIN_RPC_URL: "http://localhost:8545",
  DATA_LOOP_CONTRACT_ADDRESS: "0x8888888888888888888888888888888888888888",
  API_SIGNER_PRIVATE_KEY: `0x${"99".repeat(32)}`
};

test("Walrus uploads remain disabled without a signer or HTTP publisher", () => {
  const config = getApiConfig(baseEnv);

  assert.equal(config.agent.storage.enabled, false);
  assert.equal(config.agent.storage.privateKey, null);
  assert.equal(config.agent.storage.network, "testnet");
  assert.equal(config.agent.storage.defaultEpochs, 3);
});

test("a Sui agent key enables primary Walrus SDK uploads", () => {
  const config = getApiConfig({
    ...baseEnv,
    SUI_AGENT_PRIVATE_KEY: "suiprivkey1example",
    WALRUS_DEFAULT_EPOCHS: "5"
  });

  assert.equal(config.agent.storage.enabled, true);
  assert.equal(config.agent.storage.privateKey, "suiprivkey1example");
  assert.equal(config.agent.storage.defaultEpochs, 5);
});

test("a testnet publisher enables the HTTP fallback without a signer", () => {
  const config = getApiConfig({
    ...baseEnv,
    WALRUS_PUBLISHER_URL: "https://publisher.example"
  });

  assert.equal(config.agent.storage.enabled, true);
  assert.equal(config.agent.storage.publisherUrl, "https://publisher.example");
});
