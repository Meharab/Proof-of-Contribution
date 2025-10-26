import React, { useState } from "react";
import { getContract } from "../utils/ethers";
import PocAbi from "../contracts/ProofOfContribution.json";

export default function PoolView() {
    const [poolId, setPoolId] = useState("");
    const [poolInfo, setPoolInfo] = useState(null);
    const [contribution, setContribution] = useState(null);

    async function loadPool() {
        try {
            const contract = getContract();
            const p = await contract.getPool(Number(poolId));
            setPoolInfo(p);
        } catch (err) {
            console.error(err);
            alert(err?.message || err);
        }
    }

    async function loadContribution(id) {
        try {
            const contract = getContract();
            const c = await contract.getContribution(Number(poolId), Number(id));
            setContribution(c);
        } catch (err) {
            console.error(err);
            alert(err?.message || err);
        }
    }

    return (
        <div>
            <h2>Pool View</h2>
            <div>
                <input placeholder="PoolId" value={poolId} onChange={(e) => setPoolId(e.target.value)} />
                <button onClick={loadPool}>Load Pool</button>
            </div>

            {poolInfo && (
                <div style={{ marginTop: 12 }}>
                    <div>Creator: {poolInfo.creator}</div>
                    <div>Token: {poolInfo.token}</div>
                    <div>Total Fund: {String(poolInfo.totalFund)}</div>
                    <div>Reward per contribution: {String(poolInfo.rewardPerContribution)}</div>
                    <div>Contributions Count: {String(poolInfo.contributionsCount)}</div>

                    <div style={{ marginTop: 8 }}>
                        <input placeholder="ContributionId" onBlur={(e) => loadContribution(e.target.value)} />
                    </div>
                </div>
            )}

            {contribution && (
                <div style={{ marginTop: 8 }}>
                    <div>Hash: {contribution.contributionHash}</div>
                    <div>Contributor: {contribution.contributor}</div>
                    <div>State: {contribution.state.toString()}</div>
                    <div>Attestor: {contribution.attestor}</div>
                </div>
            )}
        </div>
    );
}
