import React, { useState, useEffect } from "react";
import CreatePool from "./pages/CreatePool";
import PoolView from "./pages/PoolView";
import SubmitContribution from "./pages/SubmitContribution";
import ClaimWithAttestation from "./pages/ClaimWithAttestation";
import { getProvider, requestAccounts } from "./utils/ethers";

export default function App() {
  const [account, setAccount] = useState(null);

  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.on("accountsChanged", (accounts) => {
      setAccount(accounts[0] ?? null);
    });
    window.ethereum.on("chainChanged", () => window.location.reload());
    (async () => {
      try {
        const provider = getProvider();
        const accounts = await provider.listAccounts();
        setAccount(accounts?.[0]?.address ?? accounts?.[0] ?? null);
      } catch { }
    })();
  }, []);

  async function connect() {
    try {
      await requestAccounts();
      const provider = getProvider();
      const accounts = await provider.listAccounts();
      setAccount(accounts?.[0]?.address ?? accounts?.[0] ?? null);
    } catch (err) {
      alert(err.message || err);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Proof-of-Contribution (MVP)</h1>
        <button onClick={connect}>
          {account ? `Connected: ${String(account).slice(0, 6)}…` : "Connect Wallet"}
        </button>
      </header>

      <main style={{ marginTop: 20 }}>
        <CreatePool account={account} />
        <hr />
        <PoolView account={account} />
        <hr />
        <SubmitContribution account={account} />
        <hr />
        <ClaimWithAttestation account={account} />
      </main>
    </div>
  );
}
