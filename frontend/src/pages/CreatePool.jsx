import React, { useState } from "react";
import { getSigner, getContract } from "../utils/ethers";
import { ethers } from "ethers";
import PocAbi from "../contracts/ProofOfContribution.json";

export default function CreatePool({ account }) {
    const [token, setToken] = useState("");
    const [fund, setFund] = useState("0");
    const [reward, setReward] = useState("0");
    const [loading, setLoading] = useState(false);

    async function createPool() {
        if (!account) return alert("Connect wallet");
        try {
            setLoading(true);
            const signer = await getSigner();
            const contract = getContract(undefined, signer);

            // if token is address(0) your contract doesn't accept ERC20; ensure token valid
            const fundBig = ethers.parseUnits(fund || "0", 18);
            const rewardBig = ethers.parseUnits(reward || "0", 18);

            // For ERC20 token, sponsor must first approve. We assume sponsor approved off-ui or do it here.
            // If token is not zero, do approve flow
            if (token && token !== ethers.ZeroAddress) {
                const erc20 = new ethers.Contract(token, [
                    "function approve(address spender,uint256 amount) public returns (bool)"
                ], signer);
                const approveTx = await erc20.approve(contract.target, fundBig);
                await approveTx.wait();
            }

            const tx = await contract.createPool(token, fundBig, rewardBig, 0);
            const receipt = await tx.wait();
            alert(`Pool created in tx ${receipt.transactionHash}`);
        } catch (err) {
            console.error(err);
            alert(err?.message || err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div>
            <h2>Create Pool</h2>
            <div style={{ display: "grid", gap: 8, maxWidth: 540 }}>
                <label>
                    ERC20 Token address:
                    <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="0x..." />
                </label>
                <label>
                    Fund (units):
                    <input value={fund} onChange={(e) => setFund(e.target.value)} />
                </label>
                <label>
                    Reward per contribution:
                    <input value={reward} onChange={(e) => setReward(e.target.value)} />
                </label>
                <button onClick={createPool} disabled={loading}>{loading ? "Creating..." : "Create Pool"}</button>
            </div>
        </div>
    );
}
